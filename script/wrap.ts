import { execSync } from "node:child_process"

execSync("cp -r deployments ../abyss-config")
execSync("cp -r json ../abyss-config")
execSync("cp artifacts/src/Main.sol/Main.json ../abyss-graph/abi")