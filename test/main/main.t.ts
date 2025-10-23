import { BigNumberish, parseEther, Signer, ZeroAddress } from "ethers"
import { Groth16Verifier, Main, MockERC20, Swapper } from "../../typechain-types"
import { ethers } from "hardhat"
import TinyMerkleTree, { extractKeyMetadata, generateDepositKey, generatekeys, getInputObjects, getLeafFromKey, getMaxSlots, getMaxWithdrawalOnAmount, getMaxWithdrawalOnKey, getRandomNullifier, hashNums, hexify, NOTE, smolPadding } from "@fifteenfigures/tiny-merkle-tree"
import assert from "node:assert/strict"
import { HermesClient } from "@pythnetwork/hermes-client"
import { collector, elisha, fisk, george, hank, sCollector, SECRET_KEY_LENGTH } from "../constants"
import Randomstring = require("randomstring")
import { expect } from "chai"
import commaNumber = require("comma-number")
import path = require("node:path")
import { groth16 } from "snarkjs"
import { writeFileSync } from "node:fs"

const wasmPath = path.join(__dirname, "/artifacts/main.wasm")
const zkeyPath = path.join(__dirname, "/artifacts/main2.zkey")

const mockPA: [BigNumberish, BigNumberish] = [BigInt(1), BigInt(2)]
const mockPB: [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]] = [[BigInt(1), BigInt(2)], [BigInt(1), BigInt(2)]]
const mockPC: [BigNumberish, BigNumberish] = [BigInt(1), BigInt(2)]

const fakeRoot = "0x12b41f94c4a330f921ab2f6a6bdf3e6df02c054e032c06673ab94b2f7eae7bb2"

describe("Main Tests", function () {
    let main: Main
    let mainAddress: string

    let alice: Signer
    let bob: Signer
    let chris: Signer

    let aliceAddress: string
    let bobAddress: string
    let chrisAddress: string

    let swapper: Swapper
    let swapperAddress: string

    let mockERC20: MockERC20
    let mockERC20Address: string

    let verifier: Groth16Verifier
    let verifierAddress: string

    const PYTH_ORACLE_ADDRESS = "0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF"
    const ETH_PRICE_FEED_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"

    const hermesConnection = new HermesClient("https://hermes.pyth.network", {})

    const leaves: string[] = []
    let priceUpdate: string[]
    let feeUpdatePrice: bigint

    let randomUsedLeaf: string
    let usedDepositKey: string
    let usedWithdrawalkey: string
    let bobsWithdrawalAmount: bigint
    let secretKey: string
    let nullifier: bigint

    const bobDeposit = BigInt(10e6)

    before(async function () {
        [alice, bob, chris] = await ethers.getSigners()
        aliceAddress = await alice.getAddress()
        bobAddress = await bob.getAddress()
        chrisAddress = await chris.getAddress()

        const oracleRegistry = await ethers.deployContract("OracleRegistry", [aliceAddress, []])
        const oracleRegistryAddress = await oracleRegistry.getAddress()
        await oracleRegistry.connect(alice).addAssetPriceFeeds([{
            asset: ZeroAddress,
            priceFeedId: ETH_PRICE_FEED_ID
        }])

        swapper = await ethers.deployContract("Swapper", [
            "PrivateToken",
            "PRIV",
            oracleRegistryAddress,
            PYTH_ORACLE_ADDRESS,
            []
        ])
        swapperAddress = await swapper.getAddress()

        mockERC20 = await ethers.deployContract("MockERC20", ["Mock", "MCK"])
        mockERC20Address = await mockERC20.getAddress()

        const balance = BigInt(5e38)
        mockERC20.mint(aliceAddress, balance)
        mockERC20.mint(bobAddress, balance)
        mockERC20.connect(alice).approve(swapper, balance)
        mockERC20.connect(bob).approve(swapper, balance)

        verifier = await ethers.deployContract("Groth16Verifier")
        verifierAddress = await verifier.getAddress()

        const PoseidonT2 = await (await ethers.deployContract("PoseidonT2")).getAddress()
        const PoseidonT3 = await (await ethers.deployContract("PoseidonT3")).getAddress()

        const initLeaf = hashNums([getRandomNullifier()])
        leaves.push(initLeaf)

        main = await ethers.deployContract("Main", [
            initLeaf,
            verifierAddress,
            swapperAddress,
            "Wrapped Private Token",
            "wPRIV"
        ], {
            libraries: {
                PoseidonT2,
                PoseidonT3
            }
        })

        mainAddress = await main.getAddress()

        priceUpdate = await getLatestPriceUpdate()
    })

    async function getLatestPriceUpdate(): Promise<string[]> {
        const updates = await hermesConnection.getLatestPriceUpdates([ETH_PRICE_FEED_ID])
        const hexifiedData = updates.binary.data.map(function (data) {
            return hexify(data)
        })

        return hexifiedData
    }

    it("Decimals should be 6.", async function () {
        const decimals = await main.decimals()
        assert(decimals == 6n)
    })

    it("Should get update fee.", async function () {
        feeUpdatePrice = await swapper.getOracleUpdateFee(await getLatestPriceUpdate())

        console.log({ feeUpdatePrice }) // In Wei.
    })

    it("Make a valid deposit and add leaf.", async function () {
        secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })

        const swapParams = {
            assetToSwapToOrFrom: ZeroAddress,
            amountToSwapToOrFrom: parseEther("5"),
            receiver: bobAddress,
            updateData: await getLatestPriceUpdate()
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const bobBalance = await swapper.balanceOf(bobAddress)
        await swapper.connect(bob).approve(mainAddress, bobBalance)

        const { depositKey, withdrawalKey } = generatekeys(bobDeposit, secretKey)
        usedWithdrawalkey = withdrawalKey
        // Value in key is slightly higher than what the key stores due to fees.
        bobsWithdrawalAmount = getMaxWithdrawalOnKey(withdrawalKey)

        usedDepositKey = depositKey
        randomUsedLeaf = getLeafFromKey(depositKey)
        leaves.push(randomUsedLeaf)

        const depositParams = {
            depositKey,
            includeLeaf: true,
            recipient: ZeroAddress
        }


        let balance = await swapper.balanceOf(collector)
        console.log({ collectorBalanceBefore: balance })

        balance = await swapper.balanceOf(sCollector)
        console.log({ sCollectorBalanceBefore: balance })

        await main.connect(bob).deposit(depositParams)

        balance = await swapper.balanceOf(collector)
        console.log({ collectorBalanceAfter: balance })

        balance = await swapper.balanceOf(sCollector)
        console.log({ sCollectorBalanceAfter: balance })

        const tree = new TinyMerkleTree(leaves)
        const root = await main.root()

        assert(tree.root == root)
    })

    it("Reverts for depositing with used leaf.", async function () {
        const swapParams = {
            assetToSwapToOrFrom: ZeroAddress,
            amountToSwapToOrFrom: parseEther("10"),
            receiver: bobAddress,
            updateData: await getLatestPriceUpdate()
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const bobBalance = await swapper.balanceOf(bobAddress)
        await swapper.connect(bob).approve(mainAddress, bobBalance)

        const depositParams = {
            depositKey: usedDepositKey,
            includeLeaf: true,
            recipient: ZeroAddress
        }

        await expect(main.connect(bob).deposit(depositParams))
            .to.be.revertedWithCustomError(main, "KeyAlreadyUsed")
    })

    it("Make a valid deposit without adding leaf.", async function () {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })

        const swapParams = {
            assetToSwapToOrFrom: ZeroAddress,
            amountToSwapToOrFrom: parseEther("5"),
            receiver: chrisAddress,
            updateData: await getLatestPriceUpdate()
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const chrisBalance = await swapper.balanceOf(chrisAddress)
        await swapper.connect(chris).approve(mainAddress, chrisBalance)
        console.log({ chrisBalance })

        const { depositKey } = generatekeys(chrisBalance, secretKey)

        const depositParams = {
            depositKey,
            includeLeaf: false,
            recipient: chrisAddress
        }

        let balance = await main.balanceOf(chrisAddress)
        console.log({ balanceBefore: `${commaNumber(Number(balance / BigInt(1e6)))} $wPRIV` })

        await main.connect(chris).deposit(depositParams)

        balance = await main.balanceOf(chrisAddress)
        console.log({ balanceAfter: `${commaNumber(Number(balance / BigInt(1e6)))} $wPRIV` })

        // Leaf wasn't used.
        const tree = new TinyMerkleTree(leaves)
        const root = await main.root()

        // Root is still same.
        assert(tree.root == root)
    })

    it("Revert because of inexistent root.", async function () {
        await expect(
            main
                .connect(alice)
                .withdraw(
                    fakeRoot,
                    usedWithdrawalkey,
                    mockPA,
                    mockPB,
                    mockPC,
                    0,
                    getRandomNullifier(),
                    elisha,
                    bobsWithdrawalAmount
                )
        ).to.be.revertedWithCustomError(main, "RootNotInHistory")
    })

    it("Revert because withdrawal exceeds amount.", async function () {
        const root = await main.root()

        await expect(
            main
                .connect(alice)
                .withdraw(
                    root,
                    usedWithdrawalkey,
                    mockPA,
                    mockPB,
                    mockPC,
                    0,
                    getRandomNullifier(),
                    elisha,
                    bobsWithdrawalAmount + 1n
                )
        ).to.be.revertedWithCustomError(main, "WithdrawalExceedsMaxInSlot")
    })

    it("Fail to verify proof.", async function () {
        const root = await main.root()

        await expect(
            main
                .connect(alice)
                .withdraw(
                    root,
                    usedWithdrawalkey,
                    mockPA,
                    mockPB,
                    mockPC,
                    0,
                    getRandomNullifier(),
                    elisha,
                    bobsWithdrawalAmount
                )
        ).to.be.revertedWithCustomError(main, "ProofNotVerified")
    })

    async function deposit() {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generatekeys(bobDeposit, secretKey)
        const stdKey = getLeafFromKey(depositKey)

        usedDepositKey = depositKey
        leaves.push(stdKey)

        const depositParams = {
            depositKey,
            includeLeaf: true,
            recipient: ZeroAddress
        }

        await main.connect(bob).deposit(depositParams)

        assert(await main.root() == new TinyMerkleTree(leaves).root)
    }

    it("Should make withdrawal.", async function () {
        const randomNumberOfDeposits = getRandomNumber()
        for (let i = 0; i < randomNumberOfDeposits; i++)
            await deposit()

        const tree = new TinyMerkleTree(leaves)
        const root = tree.root
        const inputObjects = getInputObjects(usedWithdrawalkey, randomUsedLeaf, secretKey, tree)

        nullifier = BigInt(inputObjects.nullifier)

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await main.withdraw(root, usedWithdrawalkey, piA, piB, piC, BigInt(inputObjects.slot), nullifier, elisha, bobsWithdrawalAmount)
        const balance = await swapper.balanceOf(elisha)
        assert(balance == bobsWithdrawalAmount)
    })

    it("Revert because nullifier hash has already been used.", async function () {
        const randomNumberOfDeposits = getRandomNumber()
        for (let i = 0; i < randomNumberOfDeposits; i++)
            await deposit()

        const tree = new TinyMerkleTree(leaves)
        const root = tree.root
        const inputObjects = getInputObjects(usedWithdrawalkey, randomUsedLeaf, secretKey, tree)

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await expect(
            main.withdraw(root, usedWithdrawalkey, piA, piB, piC, 0, BigInt(nullifier.toString()), elisha, BigInt(1e10))
        ).to.be.revertedWithCustomError(main, "NullifierUsed")
    })

    it("Unwrap Chris' $wPRIV.", async function () {
        let balance = await main.balanceOf(chrisAddress)
        console.log({ chrisBalance: balance })

        balance = await swapper.balanceOf(george)
        console.log({ georgeBalanceBefore: balance })

        const unWrapAmount = await main.balanceOf(chrisAddress)
        await main.connect(chris).unWrap(unWrapAmount, george)

        balance = await swapper.balanceOf(george)
        console.log({ georgeBalanceAfter: balance })
    })

    let splitWKey: string
    let splitDepositSecretKey: string
    let splitDepositLeaf: string

    it("Revert on split deposit with quotient > 100.", async function () {
        const amountForSplitDeposit = BigInt(10_099_999_999 + 1)
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })

        const swapParams = {
            assetToSwapToOrFrom: ZeroAddress,
            amountToSwapToOrFrom: parseEther("5000"),
            receiver: bobAddress,
            updateData: await getLatestPriceUpdate()
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const bobBalance = await swapper.balanceOf(bobAddress)
        await swapper.connect(bob).approve(mainAddress, bobBalance)

        const { depositKey } = generatekeys(amountForSplitDeposit, secretKey)

        const depositParams = {
            depositKey,
            includeLeaf: true,
            recipient: ZeroAddress
        }

        await expect(main.connect(bob).splitDeposit(depositParams))
            .to.be.revertedWithCustomError(main, "Max100By100")
    })

    it("Deposit 250 using split deposit.", async function () {
        // Bob still has his balance from previous test.
        const amountForSplitDeposit = BigInt(250e6)

        splitDepositSecretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey, withdrawalKey } = generatekeys(amountForSplitDeposit, splitDepositSecretKey)

        splitWKey = withdrawalKey

        const keyHashBigInt = BigInt(extractKeyMetadata(depositKey).keyHash)

        const concat = `${smolPadding(`0x${(keyHashBigInt + 1n).toString(16)}`)}${smolPadding(`0x${50e6.toString(16)}`).slice(2)}`
        const concat1 = `${smolPadding(`0x${(keyHashBigInt + 2n).toString(16)}`)}${smolPadding(`0x${NOTE.toString(16)}`).slice(2)}`
        const concat2 = `${smolPadding(`0x${(keyHashBigInt + 3n).toString(16)}`)}${smolPadding(`0x${NOTE.toString(16)}`).slice(2)}`

        const splitDepositLeaf0 = getLeafFromKey(concat)
        splitDepositLeaf = getLeafFromKey(concat1)
        const splitDepositLeaf2 = getLeafFromKey(concat2)

        leaves.push(splitDepositLeaf0)
        leaves.push(splitDepositLeaf)
        leaves.push(splitDepositLeaf2)

        const depositParams = {
            depositKey,
            includeLeaf: true,
            recipient: ZeroAddress
        }

        await main.connect(bob).splitDeposit(depositParams)
        assert(await main.root() == new TinyMerkleTree(leaves).root)
    })

    it("Fail to verify proof on withdrawal from a fake slot.", async function () {
        const max = getMaxWithdrawalOnAmount(BigInt(100e6))
        const slots = 4

        const tree = new TinyMerkleTree(leaves)
        const root = tree.root

        const inputObjects = getInputObjects(splitWKey, splitDepositLeaf, splitDepositSecretKey, tree)
        inputObjects.slot = 2 // Leaf I'm proving is at slot 2. L-470.

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await expect(main.withdraw(root, splitWKey, piA, piB, piC, BigInt(slots), inputObjects.nullifier, hank, max))
            .to.be.revertedWithCustomError(main, "ProofNotVerified")
    })

    it("Fail to withdraw more than max from a slot.", async function () {
        const max = getMaxWithdrawalOnAmount(BigInt(100e6))
        const slot = 2

        const tree = new TinyMerkleTree(leaves)
        const root = tree.root

        const inputObjects = getInputObjects(splitWKey, splitDepositLeaf, splitDepositSecretKey, tree)
        inputObjects.slot = slot // Leaf I'm proving is at slot 2. L-470.

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await expect(main.withdraw(root, splitWKey, piA, piB, piC, BigInt(slot), inputObjects.nullifier, hank, max + 1n))
            .to.be.revertedWithCustomError(main, "WithdrawalExceedsMaxInSlot")
    })

    it("Withdraw from a slot.", async function () {
        const max = getMaxWithdrawalOnAmount(BigInt(100e6))
        const slot = 2

        const tree = new TinyMerkleTree(leaves)
        const root = tree.root

        const inputObjects = getInputObjects(splitWKey, splitDepositLeaf, splitDepositSecretKey, tree)
        inputObjects.slot = slot // Leaf I'm proving is at slot 2. L-470.

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await main.withdraw(root, splitWKey, piA, piB, piC, BigInt(slot), inputObjects.nullifier, hank, max)
        assert(await swapper.balanceOf(hank) == max)
    })
})

function getRandomNumber() {
    return 1
    return Math.floor(Math.random() * 100)
}