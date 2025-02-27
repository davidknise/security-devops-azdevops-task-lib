"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsdoInstaller = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const tl = __importStar(require("azure-pipelines-task-lib/task"));
class MsdoInstaller {
    install(cliVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('Installing Microsoft Security DevOps Cli...');
            if (process.env.MSDO_FILEPATH) {
                console.log(`MSDO CLI File Path overriden by %MSDO_FILEPATH%: ${process.env.MSDO_FILEPATH}`);
                return;
            }
            if (process.env.MSDO_DIRECTORY) {
                console.log(`MSDO CLI Directory overriden by %MSDO_DIRECTORY%: ${process.env.MSDO_DIRECTORY}`);
                let msdoFilePath = path.join(process.env.MSDO_DIRECTORY, 'guardian');
                tl.debug(`msdoFilePath = ${msdoFilePath}`);
                process.env.MSDO_FILEPATH = msdoFilePath;
                return;
            }
            let msdoDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_msdo');
            tl.debug(`msdoDirectory = ${msdoDirectory}`);
            this.ensureDirectory(msdoDirectory);
            let msdoPackagesDirectory = path.join(msdoDirectory, 'versions');
            tl.debug(`msdoPackagesDirectory = ${msdoPackagesDirectory}`);
            this.ensureDirectory(msdoPackagesDirectory);
            let msdoVersionsDirectory = path.join(msdoPackagesDirectory, 'microsoft.security.devops.cli');
            tl.debug(`msdoVersionsDirectory = ${msdoVersionsDirectory}`);
            if (this.isInstalled(msdoVersionsDirectory, cliVersion)) {
                return;
            }
            let failed = false;
            let attempts = 0;
            let maxAttempts = 2;
            do {
                try {
                    failed = false;
                    const msdoTaskLibDirectory = path.resolve(__dirname);
                    tl.debug(`msdoTaskLibDirectory = ${msdoTaskLibDirectory}`);
                    const msdoProjectFile = path.join(msdoTaskLibDirectory, 'msdo-task-lib.proj');
                    tl.debug(`msdoProjectFile = ${msdoProjectFile}`);
                    let tool = tl.tool('dotnet')
                        .arg('restore')
                        .arg(msdoProjectFile)
                        .arg(`/p:MsdoPackageVersion=${cliVersion}`)
                        .arg('--packages')
                        .arg(msdoPackagesDirectory)
                        .arg('--source')
                        .arg('https://api.nuget.org/v3/index.json');
                    yield tool.exec();
                }
                catch (error) {
                    tl.debug(error);
                    failed = true;
                    attempts += 1;
                    if (attempts > maxAttempts) {
                        break;
                    }
                }
            } while (failed);
            this.resolvePackageDirectory(msdoVersionsDirectory, cliVersion);
        });
    }
    ensureDirectory(directory) {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }
    }
    isInstalled(versionsDirectory, cliVersion) {
        let installed = false;
        if (cliVersion.includes("*")) {
            tl.debug(`MSDO CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
            return installed;
        }
        this.setVariablesWithVersion(versionsDirectory, cliVersion);
        if (fs.existsSync(process.env.MSDO_DIRECTORY)) {
            console.log(`MSDO CLI v${cliVersion} already installed.`);
            installed = true;
        }
        return installed;
    }
    resolvePackageDirectory(versionDirectory, cliVersion) {
        if (cliVersion.includes("*")) {
            let packageDirectory = this.findLatestVersionDirectory(versionDirectory);
            this.setVariables(packageDirectory);
        }
        else {
            this.setVariablesWithVersion(versionDirectory, cliVersion);
        }
        if (!fs.existsSync(process.env.MSDO_DIRECTORY)) {
            throw `MSDO CLI v${cliVersion} was not found after installation.`;
        }
    }
    findLatestVersionDirectory(versionsDirectory, isPreRelease = false) {
        let latestDirectory = null;
        let latestVersionParts = null;
        let latestIsPreRelease = false;
        let latestPreReleaseFlag = null;
        tl.debug(`Searching for all version folders in: ${versionsDirectory}`);
        let dirs = this.getDirectories(versionsDirectory);
        for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
            let dir = dirs[dirIndex];
            if (dir == null || dir == "") {
                tl.debug(`Skipping null or empty directory: ${dir}`);
                continue;
            }
            tl.debug(`Evaluating MSDO directory: ${dir}`);
            const dirRegex = new RegExp(/^(\d+\.?){1,6}(\-\w+)?$/g);
            if (dirRegex.exec(dir) == null) {
                tl.debug(`Skipping invalid version directory: ${dir}`);
                continue;
            }
            let fullVersionParts = dir.split("-");
            if (fullVersionParts == null || fullVersionParts.length < 0 || fullVersionParts.length > 2) {
                tl.debug(`Skipping invalid version directory: ${dir}`);
            }
            let dirIsPreRelease = fullVersionParts.length > 1;
            if (!isPreRelease && dirIsPreRelease) {
                tl.debug(`Skipping pre-release version directory: ${dir}`);
                continue;
            }
            let dirPreReleaseFlag = null;
            if (dirIsPreRelease) {
                dirPreReleaseFlag = fullVersionParts[1];
            }
            let versionNumbersString = fullVersionParts[0];
            let versionParts = dir.split(".");
            let isLatest = latestDirectory == null;
            if (!isLatest) {
                let maxVersionParts = versionParts.length;
                if (latestVersionParts.length > maxVersionParts) {
                    maxVersionParts = latestVersionParts.length;
                }
                for (let versionPartIndex = 0; versionPartIndex < versionParts.length; versionPartIndex++) {
                    let versionPart = 0;
                    let latestVersionPart = 0;
                    let isLastVersionPart = versionPartIndex == (maxVersionParts - 1);
                    if (versionPartIndex < versionParts.length) {
                        versionPart = parseInt(versionParts[versionPartIndex]);
                    }
                    if (versionPartIndex < latestVersionParts.length) {
                        latestVersionPart = parseInt(latestVersionParts[versionPartIndex]);
                    }
                    if (versionPart > latestVersionPart) {
                        isLatest = true;
                    }
                    else if (versionPart == latestVersionPart) {
                        isLatest = isLastVersionPart
                            &&
                                ((isPreRelease && latestIsPreRelease && dirPreReleaseFlag > latestPreReleaseFlag)
                                    ||
                                        (!isPreRelease && latestIsPreRelease));
                    }
                    else {
                        break;
                    }
                    if (isLatest) {
                        break;
                    }
                }
            }
            if (isLatest) {
                tl.debug(`Setting latest version directory: ${dir}`);
                latestDirectory = path.join(versionsDirectory, dir);
                latestVersionParts = versionParts;
                latestIsPreRelease = dirIsPreRelease;
                latestPreReleaseFlag = dirPreReleaseFlag;
            }
        }
        tl.debug(`latestDirectory = ${latestDirectory}`);
        return latestDirectory;
    }
    getDirectories(directory) {
        return fs.readdirSync(directory).filter(p => this.isDirectory(directory, p));
    }
    isDirectory(directory, p) {
        return fs.statSync(path.join(directory, p)).isDirectory();
    }
    setVariablesWithVersion(versionDirectory, cliVersion) {
        let packageDirectory = path.join(versionDirectory, cliVersion);
        tl.debug(`packageDirectory = ${packageDirectory}`);
        this.setVariables(packageDirectory);
    }
    setVariables(packageDirectory) {
        let msdoDirectory = path.join(packageDirectory, 'tools');
        tl.debug(`msdoDirectory = ${msdoDirectory}`);
        let msdoFilePath = path.join(msdoDirectory, 'guardian');
        tl.debug(`msdoFilePath = ${msdoFilePath}`);
        process.env.MSDO_DIRECTORY = msdoDirectory;
        process.env.MSDO_FILEPATH = msdoFilePath;
    }
}
exports.MsdoInstaller = MsdoInstaller;
