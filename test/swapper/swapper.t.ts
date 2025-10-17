import { ethers } from "hardhat"
import { MockERC20, OracleRegistry, Swapper } from "../../typechain-types"
import { parseEther, Signer, ZeroAddress } from "ethers"
import { expect } from "chai"
import assert from "node:assert/strict"
import { HermesClient } from "@pythnetwork/hermes-client"
import { hexify } from "@fifteenfigures/tiny-merkle-tree"
import { dante } from "../constants"
import commaNumber from "comma-number"

describe("Swapper Tests", function () {
    let oracleRegistry: OracleRegistry
    let oracleRegistryAddress: string

    let alice: Signer
    let bob: Signer

    let aliceAddress: string
    let bobAddress: string

    let swapper: Swapper
    let swapperAddress: string

    let mockERC20: MockERC20
    let mockERC20Address: string

    const PYTH_ORACLE_ADDRESS = "0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF"
    const ETH_PRICE_FEED_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"

    const hermesConnection = new HermesClient("https://hermes.pyth.network", {})
    let priceUpdate: string[]
    let feeUpdatePrice: bigint

    before(async function () {
        [alice, bob] = await ethers.getSigners()
        aliceAddress = await alice.getAddress()
        bobAddress = await bob.getAddress()

        oracleRegistry = await ethers.deployContract("OracleRegistry", [aliceAddress])
        oracleRegistryAddress = await oracleRegistry.getAddress()
        await oracleRegistry.connect(alice).addAssetPriceFeed({
            asset: ZeroAddress,
            priceFeedId: ETH_PRICE_FEED_ID
        })

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
        mockERC20.connect(alice).approve(swapper, balance)

        const updates = await hermesConnection.getLatestPriceUpdates([ETH_PRICE_FEED_ID])
        const hexifiedData = updates.binary.data.map(function (data) {
            return hexify(data)
        })

        priceUpdate = hexifiedData

        if (updates.parsed) {
            const price = BigInt(updates.parsed[0].price.price)
            const expo = BigInt(10 ** (-1 * updates.parsed[0].price.expo))
            const ethPrice = price / expo

            console.log({ ethPrice: `${commaNumber(Number(ethPrice))} USD` })
        }
    })

    it("Should initialize public variables.", async function () {
        const registry = await swapper.ORACLE_REGISTRY()
        const pyth = await swapper.PYTH()

        assert(registry != ZeroAddress)
        assert(pyth != ZeroAddress)
    })

    it("Should get update fee.", async function () {
        feeUpdatePrice = await swapper.getOracleUpdateFee(priceUpdate)

        console.log({ feeUpdatePrice }) // In Wei.
    })

    let swapParams = {
        assetToSwapToOrFrom: ZeroAddress,
        amountToSwapToOrFrom: parseEther("5"),
        receiver: "",
        updateData: [""]
    }

    it("Revert because asset is Swapper contract.", async function () {
        swapParams = {
            ...swapParams,
            assetToSwapToOrFrom: swapperAddress,
            receiver: bobAddress,
            updateData: priceUpdate
        }

        await expect(swapper.connect(alice).swapToPrivateToken(swapParams))
            .to.be.revertedWithCustomError(swapper, "SwapOnlyToPrivateToken")
    })

    it("Revert because caller is receiver.", async function () {
        swapParams = {
            ...swapParams,
            assetToSwapToOrFrom: ZeroAddress,
            receiver: aliceAddress,
            updateData: priceUpdate
        }

        await expect(swapper.connect(alice).swapToPrivateToken(swapParams))
            .to.be.revertedWithCustomError(swapper, "SwapperMustNotBeReceiver")
    })

    it("Revert because oracle is not set.", async function () {
        swapParams = {
            ...swapParams,
            assetToSwapToOrFrom: mockERC20Address,
            receiver: bobAddress,
            updateData: priceUpdate
        }

        await expect(swapper.connect(alice).swapToPrivateToken(swapParams))
            .to.be.revertedWithCustomError(swapper, "OracleNotSet")
    })

    it("Revert because value sent is < amount + fee update price.", async function () {
        swapParams = {
            ...swapParams,
            assetToSwapToOrFrom: ZeroAddress,
            receiver: bobAddress,
            updateData: priceUpdate
        }

        await expect(swapper.connect(alice).swapToPrivateToken(swapParams, { value: swapParams.amountToSwapToOrFrom }))
            .to.be.revertedWithCustomError(swapper, "ETHSentLessThanSwapPlusFee")
    })

    it("Swap and mint $PRIV.", async function () {
        swapParams = {
            ...swapParams,
            assetToSwapToOrFrom: ZeroAddress,
            receiver: bobAddress,
            updateData: priceUpdate
        }

        let balance: bigint

        balance = await swapper.balanceOf(bobAddress)
        console.log({ balanceBefore: `${commaNumber(Number(balance / BigInt(1e6)))} $PRIV` })

        await swapper.connect(alice).swapToPrivateToken(swapParams, {
            value: swapParams.amountToSwapToOrFrom + feeUpdatePrice
        })

        balance = await swapper.balanceOf(bobAddress)
        console.log({ balanceAfter: `${commaNumber(Number(balance / BigInt(1e6)))} $PRIV` })
    })
})