import { existsSync, mkdirSync, writeFileSync } from "fs"
import path from "path"

export const MODE = "testnet"

export function createChainFolder(name: string) {
    const deploymentFolderPath = path.join(__dirname, "../deployments")
    if (!existsSync(deploymentFolderPath)) {
        mkdirSync(deploymentFolderPath)
    }

    const modeFolderPath = path.join(__dirname, "../deployments/", MODE)
    if (!existsSync(modeFolderPath)) {
        mkdirSync(modeFolderPath)
    }

    const generalJsonFolderPath = path.join(__dirname, "../json")
    if (!existsSync(generalJsonFolderPath)) {
        mkdirSync(generalJsonFolderPath)
    }

    if (!existsSync(path.join(generalJsonFolderPath, "/deployments.json"))) {
        writeFileSync(path.join(generalJsonFolderPath, "/deployments.json"), JSON.stringify({}))
    }

    const chainFolderPath = path.join(__dirname, "../deployments/", MODE, name)
    if (!existsSync(chainFolderPath)) {
        mkdirSync(chainFolderPath)
    }
}