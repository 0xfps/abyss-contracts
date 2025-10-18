import { ethers, run } from "hardhat";

async function deploy() {
    const constructorParams = ["Test USD", "TUSD"]
    let token = await ethers.deployContract("MockSilentERC20", constructorParams)
    await token.deploymentTransaction()?.wait(2)
    let address = await token.getAddress()
    await run("verify:verify", {
        address,
        constructorArguments: constructorParams
    })

    token = await ethers.deployContract("MockNonSilentERC20", constructorParams)
    await token.deploymentTransaction()?.wait(2)
    address = await token.getAddress()
    await run("verify:verify", {
        address,
        constructorArguments: constructorParams
    })
}

deploy()