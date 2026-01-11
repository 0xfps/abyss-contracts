import { BigNumberish, parseEther, Signer, ZeroAddress } from "ethers"
import { Groth16Verifier, Main, MockERC20, Swapper } from "../../typechain-types"
import { ethers } from "hardhat"
import TinyMerkleTree, { breakDownKey, extractKeyMetadata, generateKeys, getInputObjects, getLeafFromKey, getLeavesFromKeys, getMaxWithdrawalOnKey, getRandomNullifier, hashNums, hexify } from "@fifteenfigures/tiny-merkle-tree"
import assert from "node:assert/strict"
import { HermesClient } from "@pythnetwork/hermes-client"
import { collector, elisha, fisk, george, sCollector, SECRET_KEY_LENGTH } from "../constants"
import Randomstring = require("randomstring")
import { expect } from "chai"
import commaNumber = require("comma-number")
import path = require("node:path")
import { groth16 } from "snarkjs"

const depth = 32n

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
    const USDC_PRICE_FEED_ID = "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"

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

        mockERC20 = await ethers.deployContract("MockERC20", ["Mock", "MCK"])
        mockERC20Address = await mockERC20.getAddress()

        const priceFeeds = [{
            asset: ZeroAddress,
            priceFeedId: ETH_PRICE_FEED_ID
        }, {
            asset: mockERC20Address,
            priceFeedId: USDC_PRICE_FEED_ID
        }]

        const oracleRegistry = await ethers.deployContract("OracleRegistry", [aliceAddress, priceFeeds])
        const oracleRegistryAddress = await oracleRegistry.getAddress()

        swapper = await ethers.deployContract("Swapper", [
            "PrivateToken",
            "PRIV",
            oracleRegistryAddress,
            PYTH_ORACLE_ADDRESS
        ])
        swapperAddress = await swapper.getAddress()


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
            depth,
            initLeaf,
            verifierAddress,
            swapperAddress
        ], {
            libraries: {
                PoseidonT2,
                PoseidonT3
            }
        })

        mainAddress = await main.getAddress()

        const updates = await hermesConnection.getLatestPriceUpdates([ETH_PRICE_FEED_ID])
        const hexifiedData = updates.binary.data.map(function (data) {
            return hexify(data)
        })

        priceUpdate = hexifiedData
    })

    it("Should get update fee.", async function () {
        feeUpdatePrice = await swapper.getOracleUpdateFee(priceUpdate)

        console.log({ feeUpdatePrice }) // In Wei.
    })

    it("Make a valid deposit and add leaf.", async function () {
        secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })

        const swapParams = {
            assetToSwapToOrFrom: ZeroAddress,
            amountToSwapToOrFrom: parseEther("5"),
            receiver: bobAddress,
            updateData: priceUpdate
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const bobBalance = await swapper.balanceOf(bobAddress)
        await swapper.connect(bob).approve(mainAddress, bobBalance)

        const { depositKey, withdrawalKey } = generateKeys(bobDeposit, secretKey)
        usedWithdrawalkey = withdrawalKey
        // Value in key is slightly higher than what the key stores due to fees.
        bobsWithdrawalAmount = getMaxWithdrawalOnKey(withdrawalKey)

        usedDepositKey = depositKey
        randomUsedLeaf = getLeafFromKey(depositKey)
        leaves.push(randomUsedLeaf)

        let balance = await swapper.balanceOf(collector)
        console.log({ collectorBalanceBefore: balance })

        balance = await swapper.balanceOf(sCollector)
        console.log({ sCollectorBalanceBefore: balance })

        await main.connect(bob).deposit([depositKey])

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
            updateData: priceUpdate
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const bobBalance = await swapper.balanceOf(bobAddress)
        await swapper.connect(bob).approve(mainAddress, bobBalance)

        await expect(main.connect(bob).deposit([usedDepositKey]))
            .to.be.revertedWithCustomError(main, "KeyAlreadyUsed")
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
                    getRandomNullifier(),
                    elisha,
                    bobsWithdrawalAmount
                )
        ).to.be.revertedWithCustomError(main, "RootNotInHistory")
    })

    it("Revert because withdrwal exceeds amount.", async function () {
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
                    getRandomNullifier(),
                    elisha,
                    bobsWithdrawalAmount + 1n
                )
        ).to.be.revertedWithCustomError(main, "WithdrawalExceedsMax")
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
                    getRandomNullifier(),
                    elisha,
                    bobsWithdrawalAmount
                )
        ).to.be.revertedWithCustomError(main, "ProofNotVerified")
    })

    async function deposit() {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generateKeys(bobDeposit, secretKey)
        const stdKey = getLeafFromKey(depositKey)

        usedDepositKey = depositKey
        leaves.push(stdKey)

        await main.connect(bob).deposit([depositKey])

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

        await main.withdraw(root, usedWithdrawalkey, piA, piB, piC, nullifier, elisha, bobsWithdrawalAmount)
        const balance = await swapper.balanceOf(elisha)
        assert(balance == bobsWithdrawalAmount)

        const { amount } = extractKeyMetadata(usedWithdrawalkey)
        const withdrawals = await main.withdrawalCountForAmount(amount)
        assert(Number(withdrawals) == 1)
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
            main.withdraw(root, usedWithdrawalkey, piA, piB, piC, BigInt(nullifier.toString()), elisha, BigInt(1e10))
        ).to.be.revertedWithCustomError(main, "NullifierUsed")
    })

    it("Make another valid deposit and add leaf.", async function () {
        secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })

        const updates = await hermesConnection.getLatestPriceUpdates([ETH_PRICE_FEED_ID])
        const hexifiedData = updates.binary.data.map(function (data) {
            return hexify(data)
        })

        priceUpdate = hexifiedData

        const swapParams = {
            assetToSwapToOrFrom: ZeroAddress,
            amountToSwapToOrFrom: parseEther("5"),
            receiver: bobAddress,
            updateData: priceUpdate
        }

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        const bobBalance = await swapper.balanceOf(bobAddress)
        await swapper.connect(bob).approve(mainAddress, bobBalance)

        console.log({ bobBalance })
        const { withdrawalKey } = generateKeys(bobBalance, secretKey)
        const { depositKeys } = breakDownKey(withdrawalKey, secretKey)

        await main.connect(bob).deposit(depositKeys)
        const _leaves = getLeavesFromKeys(depositKeys)
        leaves.push(..._leaves)

        const tree = new TinyMerkleTree(leaves)
        const root = await main.root()

        assert(tree.root == root)
    })
})

function getRandomNumber() {
    return Math.floor(Math.random() * 100)
}