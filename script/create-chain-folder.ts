import { existsSync, mkdirSync, writeFileSync } from "fs"
import path from "path"

export function createChainFolder(name: string) {
    const deploymentFolderPath = path.join(__dirname, "../deployments")
    if (!existsSync(deploymentFolderPath)) {
        mkdirSync(deploymentFolderPath)
    }

    const generalJsonFilePath = path.join(__dirname, "../deployments/deployments.json")
    if (!existsSync(deploymentFolderPath)) {
        writeFileSync(generalJsonFilePath, JSON.stringify({}))
    }

    const chainFolderPath = path.join(__dirname, "../deployments/", name)
    if (!existsSync(chainFolderPath)) {
        mkdirSync(chainFolderPath)
    }
}