import { ethers } from "hardhat";
import { getEquivLeaf, getRoot } from "./mock-merkle-tree";
import assert from "node:assert/strict"

// Quite a stress test, but no issues.
const LIMITS = [10, 100, 1000, 10000, 100000, 1000000];

describe("Test root", function () {
    it("Adds a range of leaves", async function () {
        for (const LIMIT of LIMITS) {
            const p2 = await ethers.getContractFactory("PoseidonT2")
            const p3 = await ethers.getContractFactory("PoseidonT3")

            const p22 = await p2.deploy()
            const p33 = await p3.deploy()

            const p2a = await p22.getAddress()
            const p3a = await p33.getAddress()

            const TMT = await ethers.getContractFactory("TMT", {
                libraries: {
                    PoseidonT2: p2a,
                    PoseidonT3: p3a
                }
            })
            const initLeaf = getEquivLeaf(0)
            const tmt = await TMT.deploy(initLeaf)

            console.log("Testing for limit", LIMIT)

            for (let i = 1; i < LIMIT + 1; i++) {
                console.log("Added leaf", i)
                await tmt.addLeaf(getEquivLeaf(i))
                const root = await tmt.root()
                
                const { tree, leaves } = getRoot(i + 1)
                const jsRoot = tree.root
                
                const proof = tree.generateMerkleProof(leaves[0])
                const verify = tree.verifyProof(leaves[0], proof)

                assert(jsRoot == root)
                assert(verify == true)
            }

            console.log("Finished testing for limit", LIMIT)
            console.log("All roots match")
            console.log("\n")
        }
    })
})