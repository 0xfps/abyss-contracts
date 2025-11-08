import { run, ethers, network } from "hardhat"
import { TESTNET_ORACLE_ADDRESSES } from "./config/testnet-oracle-addresses"
import { TESTNET_PRICE_FEEDS } from "./config/testnet-price-feeds"
import { encodeBytes32String } from "ethers"
import { createChainFolder, MODE } from "./create-chain-folder"
import { writeAbiFile } from "./write-abi-file"
import path from "path"
import { readFileSync } from "fs"

import stableTokenArtifact from "../artifacts/src/mock/MockERC20.sol/MockERC20.json"
import oracleArtifact from "../artifacts/src/OracleRegistry.sol/OracleRegistry.json"
import swapperArtifact from "../artifacts/src/Swapper.sol/Swapper.json"
import groth16Artifact from "../artifacts/src/Verifier.sol/Groth16Verifier.json"
import poseidonT2Artifact from "../artifacts/@fifteenfigures/lib/PoseidonHash.sol/PoseidonT2.json"
import poseidonT3Artifact from "../artifacts/@fifteenfigures/lib/PoseidonHash.sol/PoseidonT3.json"
import mainArtifact from "../artifacts/src/Main.sol/Main.json"

const BLOCKS = 10
const ADDRESS = "0xa08092B3AE155e6aa3444DBEeB5D92E69E8a41fB"
const AMT = BigInt(500_000e18)

let filePath: string
let fileContents: Object
let stableTokenAddress: string
let oracleAddress: string
let oracleRegistryAddress: string
let groth16VerifierAddress: string
let poseidonT2Address: string
let poseidonT3Address: string
let swapperAddress: string
let blockNumber: number 

const name = network.name.toLowerCase()
const { chainId } = network.config

async function deploy() {
    console.log("Deploying to", name, ".")
    createChainFolder(name.toLowerCase())

    await deployStableToken()
    await deployOracleRegistry()
    await deploySwapper()

    groth16VerifierAddress = await deployGroth16()
    const addresses = await deployPoseidonLibraries()

    poseidonT2Address = addresses[0]
    poseidonT3Address = addresses[1]

    await deployMainContract()
}

async function deployStableToken() {
    const stableToken = await ethers.deployContract("MockERC20", ["Circle USD", "USDC"])
    await stableToken.waitForDeployment()
    await stableToken.deploymentTransaction()?.wait(BLOCKS)
    stableTokenAddress = await stableToken.getAddress()

    filePath = path.join(__dirname, "../deployments/", MODE, name, "/stable-token.json")
    fileContents = {
        address: stableTokenAddress,
        abi: stableTokenArtifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    const fP = path.join(__dirname, "../json/deployments.json")
    const content = JSON.parse(readFileSync(fP) as any)
    const newContent = {
        ...content,
        [chainId!]: {
            ...content[chainId!],
            stableTokenAddress
        }
    }
    writeAbiFile(fP, JSON.stringify(newContent))

    // 0x19abf40e
    console.log("Stable Token Deployed.")

    const mintTx = await stableToken.mint(ADDRESS, AMT)
    await mintTx.wait()

    console.log("$500K minted.")
}

async function deployOracleRegistry() {
    oracleAddress = TESTNET_ORACLE_ADDRESSES[chainId!]
    const oracleParams = TESTNET_PRICE_FEEDS[chainId!]

    if (!oracleAddress || Object.keys(oracleParams).length == 0) {
        throw new Error("No Oracle Address or Oracle Params.")
    }

    const oracleRegistry = await ethers.deployContract("OracleRegistry", [ADDRESS, oracleParams])
    await oracleRegistry.waitForDeployment()
    await oracleRegistry.deploymentTransaction()?.wait(BLOCKS)
    oracleRegistryAddress = await oracleRegistry.getAddress()

    console.log("Deployed OracleRegistry.")

    await run("verify:verify", {
        address: oracleRegistryAddress,
        constructorArguments: [ADDRESS, oracleParams]
    })


    filePath = path.join(__dirname, "../deployments/", MODE, name, "/oracle-registry.json")
    fileContents = {
        address: oracleRegistryAddress,
        abi: oracleArtifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    const fP = path.join(__dirname, "../json/deployments.json")
    const content = JSON.parse(readFileSync(fP) as any)
    const newContent = {
        ...content,
        [chainId!]: {
            ...content[chainId!],
            oracleRegistryAddress
        }
    }
    writeAbiFile(fP, JSON.stringify(newContent))
}

async function deploySwapper() {
    const swapperConstructorParams = [
        "Privacy Token",
        "PRIV",
        oracleRegistryAddress,
        oracleAddress,
        [stableTokenAddress]
    ]
    const swapper = await ethers.deployContract("Swapper", swapperConstructorParams)
    await swapper.waitForDeployment()
    await swapper.deploymentTransaction()?.wait(BLOCKS)
    swapperAddress = await swapper.getAddress()

    console.log("Deployed Swapper.")

    await run("verify:verify", {
        address: swapperAddress,
        constructorArguments: swapperConstructorParams
    })

    filePath = path.join(__dirname, "../deployments/", MODE, name, "/swapper.json")
    fileContents = {
        address: swapperAddress,
        abi: swapperArtifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    const fP = path.join(__dirname, "../json/deployments.json")
    const content = JSON.parse(readFileSync(fP) as any)
    const newContent = {
        ...content,
        [chainId!]: {
            ...content[chainId!],
            swapperAddress
        }
    }
    writeAbiFile(fP, JSON.stringify(newContent))
}

async function deployGroth16() {
    const name = network.name.toLowerCase()

    console.log("Deploying Groth16 library...")
    const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier")
    const groth16Verifier = await Groth16Verifier.deploy()
    await groth16Verifier.waitForDeployment()
    await groth16Verifier.deploymentTransaction()?.wait(BLOCKS)
    const groth16VerifierAddress = await groth16Verifier.getAddress()
    console.log("Deployed Groth16 libaray, verifying...")

    await run("verify:verify", {
        address: groth16VerifierAddress,
        constructorArguments: []
    })

    filePath = path.join(__dirname, "../deployments/", MODE, name, "/groth-16-verifier.json")
    fileContents = {
        address: groth16VerifierAddress,
        abi: groth16Artifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    const fP = path.join(__dirname, "../json/deployments.json")
    const content = JSON.parse(readFileSync(fP) as any)
    const newContent = {
        ...content,
        [chainId!]: {
            ...content[chainId!],
            groth16VerifierAddress
        }
    }
    writeAbiFile(fP, JSON.stringify(newContent))
    console.log("Verified Groth16 library.")

    return groth16VerifierAddress
}

async function deployPoseidonLibraries() {
    const name = network.name.toLowerCase()

    const PoseidonT2 = await ethers.getContractFactory("PoseidonT2")
    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3")

    console.log("Deploying libraries...")
    const poseidonT2 = await PoseidonT2.deploy()
    await poseidonT2.waitForDeployment()
    await poseidonT2.deploymentTransaction()?.wait(BLOCKS)
    console.log("Deployed PoseidonT2.")

    const poseidonT3 = await PoseidonT3.deploy()
    await poseidonT3.waitForDeployment()
    await poseidonT3.deploymentTransaction()?.wait(BLOCKS)
    console.log("Deployed PoseidonT3.")
    console.log("Deployed libraries.")

    const poseidonT2Address = await poseidonT2.getAddress()
    const poseidonT3Address = await poseidonT3.getAddress()

    await run("verify:verify", {
        address: poseidonT2Address,
        constructorArguments: []
    })

    await run("verify:verify", {
        address: poseidonT3Address,
        constructorArguments: []
    })

    filePath = path.join(__dirname, "../deployments/", MODE, name, "/poseidon-t2.json")
    fileContents = {
        address: poseidonT2,
        abi: poseidonT2Artifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    filePath = path.join(__dirname, "../deployments/", MODE, name, "/poseidon-t3.json")
    fileContents = {
        address: poseidonT3,
        abi: poseidonT3Artifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    const fP = path.join(__dirname, "../json/deployments.json")
    const content = JSON.parse(readFileSync(fP) as any)
    const newContent = {
        ...content,
        [chainId!]: {
            ...content[chainId!],
            poseidonT2Address,
            poseidonT3Address
        }
    }
    writeAbiFile(fP, JSON.stringify(newContent))

    return [poseidonT2Address, poseidonT3Address]
}

async function deployMainContract() {
    const mainConstructorParams = [
        encodeBytes32String(""),
        groth16VerifierAddress,
        swapperAddress
    ]

    const main = await ethers.deployContract("Main", mainConstructorParams, {
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address
        }
    })
    
    await main.waitForDeployment()
    await main.deploymentTransaction()?.wait(BLOCKS)
    const mainAddress = await main.getAddress()
    blockNumber = main.deploymentTransaction()?.blockNumber!
    console.log("Deployed Main contract at", blockNumber,", verifying...")

    await run("verify:verify", {
        address: mainAddress,
        constructorArguments: mainConstructorParams,
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address
        }
    })

    filePath = path.join(__dirname, "../deployments/", MODE, name, "/main.json")
    fileContents = {
        address: mainAddress,
        abi: mainArtifact.abi
    }

    writeAbiFile(filePath, JSON.stringify(fileContents))

    const fP = path.join(__dirname, "../json/deployments.json")
    const content = JSON.parse(readFileSync(fP) as any)
    const newContent = {
        ...content,
        [chainId!]: {
            ...content[chainId!],
            mainAddress,
            blockNumber
        }
    }
    writeAbiFile(fP, JSON.stringify(newContent))
}

deploy().then(function () {
    console.log("Deployments complete!")
}).catch(function (e) {
    console.log(e)
})