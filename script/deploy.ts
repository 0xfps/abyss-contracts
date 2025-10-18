import { run, ethers, network } from "hardhat"
import { TESTNET_ORACLE_ADDRESSES } from "./config/testnet-oracle-addresses"
import { TESTNET_PRICE_FEEDS } from "./config/testnet-price-feeds"
import { encodeBytes32String } from "ethers"

const BLOCKS = 2
const ADDRESS = "0xa08092B3AE155e6aa3444DBEeB5D92E69E8a41fB"
const AMT = BigInt(500_000e18)

async function deployGroth16() {
    console.log("Deploying Groth16 library...")
    const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier")
    const groth16Verifier = await Groth16Verifier.deploy()
    await groth16Verifier.deploymentTransaction()?.wait(BLOCKS)
    const groth16VerifierAddress = await groth16Verifier.getAddress()
    console.log("Deployed Groth16 libaray, verifying...")

    await run("verify:verify", {
        address: groth16VerifierAddress,
        constructorArguments: []
    })

    console.log("Verified Groth16 library.")

    return groth16VerifierAddress
}

async function deployPoseidonLibraries() {
    const PoseidonT2 = await ethers.getContractFactory("PoseidonT2")
    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3")

    console.log("Deploying libraries...")
    const poseidonT2 = await PoseidonT2.deploy()
    await poseidonT2.deploymentTransaction()?.wait(BLOCKS)
    console.log("Deployed PoseidonT2.")

    const poseidonT3 = await PoseidonT3.deploy()
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

    return [poseidonT2Address, poseidonT3Address]
}

async function deploy() {
    const { name } = network
    const { chainId } = network.config

    console.log("Deploying to", name, ".")

    const oracleAddress = TESTNET_ORACLE_ADDRESSES[chainId!]
    const oracleParams = TESTNET_PRICE_FEEDS[chainId!]
 
    if (!oracleAddress || Object.keys(oracleParams).length == 0) {
        throw new Error("No Oracle Address or Oracle Params.")
    }

    const stableToken = await ethers.deployContract("MockERC20", ["Circle USD", "USDC"])
    await stableToken.deploymentTransaction()?.wait(BLOCKS)
    const stableTokenAddress = await stableToken.getAddress()
    
    // 0x19abf40e
    console.log("Stable Token Deployed.")
    
    const mintTx = await stableToken.mint(ADDRESS, AMT)
    await mintTx.wait()

    console.log("$500K minted.")

    const oracleRegistry = await ethers.deployContract("OracleRegistry", [ADDRESS, oracleParams])
    await oracleRegistry.deploymentTransaction()?.wait(BLOCKS)
    const oracleRegistryAddress = await oracleRegistry.getAddress()

    console.log("Deployed OracleRegistry.")

    await run("verify:verify", {
        address: oracleRegistryAddress,
        constructorArguments: [ADDRESS, oracleParams]
    })

    const swapperConstructorParams = [
        "Privacy Token",
        "PRIV",
        oracleRegistryAddress,
        oracleAddress,
        [stableTokenAddress]
    ]
    const swapper = await ethers.deployContract("Swapper", swapperConstructorParams)
    await swapper.deploymentTransaction()?.wait(BLOCKS)
    const swapperAddress = await swapper.getAddress()

    console.log("Deployed Swapper.")

    await run("verify:verify", {
        address: swapperAddress,
        constructorArguments: swapperConstructorParams
    })

    const groth16VerifierAddress = await deployGroth16()
    const [poseidonT2Address, poseidonT3Address] = await deployPoseidonLibraries()

    const mainConstructorParams = [
        encodeBytes32String(""),
        groth16VerifierAddress,
        swapperAddress,
        "Wrapped Private Token",
        "wPRIV"
    ]

    const main = await ethers.deployContract("Main", mainConstructorParams, {
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address
        }
    })

    await main.deploymentTransaction()?.wait(BLOCKS)
    const mainAddress = await main.getAddress()
    console.log("Deployed Main contract, verifying...")

    await run("verify:verify", {
        address: mainAddress,
        constructorArguments: mainConstructorParams,
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address
        }
    })
}

deploy().then(function () {
    console.log("Deployments complete!")
}).catch(function (e) {
    console.log(e)
})