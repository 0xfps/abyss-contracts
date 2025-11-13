import { writeFileSync } from "fs"

export function writeAbiFile(filePath: string, contents: string) {
    writeFileSync(filePath, contents, { flush: true })
}