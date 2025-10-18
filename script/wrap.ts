import { execSync } from "node:child_process"

execSync("cp -r deployments ../attp-config")
execSync("cp -r json ../attp-config")