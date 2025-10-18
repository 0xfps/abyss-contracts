import { existsSync, mkdirSync, writeFileSync } from "fs"
import path from "path"

export function createChainFolder(name: string) {
    const deploymentFolderPath = path.join(__dirname, "../deployments")
    if (!existsSync(deploymentFolderPath)) {
        mkdirSync(deploymentFolderPath)
    }

    const generalJsonFolderPath = path.join(__dirname, "../json")
    if (!existsSync(generalJsonFolderPath)) {
        mkdirSync(generalJsonFolderPath)
    }

    writeFileSync(path.join(generalJsonFolderPath, "/deployments.json"), JSON.stringify({}))

    const chainFolderPath = path.join(__dirname, "../deployments/", name)
    if (!existsSync(chainFolderPath)) {
        mkdirSync(chainFolderPath)
    }
}