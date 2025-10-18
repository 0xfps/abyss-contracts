import { existsSync, writeFileSync } from "fs"
import path from "path"

export function writeAbiFile(fileName: string, contents: string) {
    const deploymentsFolder = path.join(__dirname, "../deployments")
    if (!existsSync(deploymentsFolder)) throw new Error("No 'deployments' folder found.")
    const filePath = path.join(__dirname, "../deployments", fileName)
    writeFileSync(filePath, contents, { flush: true })
}