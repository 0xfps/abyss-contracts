import { ethers } from "hardhat"
import { OracleRegistry } from "../../typechain-types"
import assert from "node:assert/strict"
import { encodeBytes32String, Signer } from "ethers"
import { collector, dante } from "../constants"
import { expect } from "chai"

describe("Oracle Registry Tests", function () {
    let oracleRegistry: OracleRegistry
    let oracleRegistryAddress: string

    let alice: Signer
    let bob: Signer

    let aliceAddress: string
    let bobAddress: string

    const demoOracleFeedId = encodeBytes32String("demo asset")
    const anotherDemoOracleFeedId = encodeBytes32String("demo asset")

    before(async function () {
        [alice, bob] = await ethers.getSigners()
        aliceAddress = await alice.getAddress()
        bobAddress = await bob.getAddress()

        oracleRegistry = await ethers.deployContract("OracleRegistry", [bobAddress, []])
        oracleRegistryAddress = await oracleRegistry.getAddress()
    })

    it("Owner should be the Bob.", async function () {
        const owner = await oracleRegistry.owner()
        assert(owner == bobAddress)
    })

    it("Revert add or remove called by not owner.", async function () {
        const params = {
            asset: dante,
            priceFeedId: demoOracleFeedId
        }
        
        await expect(oracleRegistry.connect(alice).addAssetPriceFeeds([params]))
            .to.be.revertedWithCustomError(oracleRegistry, "NotOwner");

        await expect(oracleRegistry.connect(alice).removeAssetPriceFeeds([dante]))
            .to.be.revertedWithCustomError(oracleRegistry, "NotOwner");
    })

    it("Price feed for unset asset should be bytes32(0)", async function () {
        const priceFeedId = await oracleRegistry.getPriceFeed(collector)
        assert(priceFeedId == encodeBytes32String(""))
    })

    it("Add valid demo asset oracle feed Id.", async function () {
        const params = {
            asset: dante,
            priceFeedId: demoOracleFeedId
        }

        await oracleRegistry.connect(bob).addAssetPriceFeeds([params])
        const priceFeedId = await oracleRegistry.getPriceFeed(dante)
        assert(priceFeedId == demoOracleFeedId)
    })

    it("Add valid demo asset oracle feed Id doesn't reset set feed Id.", async function () {
        const params = {
            asset: dante,
            priceFeedId: anotherDemoOracleFeedId
        }

        await oracleRegistry.connect(bob).addAssetPriceFeeds([params])
        const priceFeedId = await oracleRegistry.getPriceFeed(dante)
        assert(priceFeedId == demoOracleFeedId)
    })

    it("Remove set asset oracle feed Id.", async function () {
        const asset = dante

        await oracleRegistry.connect(bob).removeAssetPriceFeeds([asset])
        const priceFeedId = await oracleRegistry.getPriceFeed(dante)
        assert(priceFeedId == encodeBytes32String(""))
    })
})