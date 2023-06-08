import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as tl from 'azure-pipelines-task-lib/task';
import * as common from './msdo-common';
import * as nuget from './msdo-nuget-client';

/**
 * Installs the MSDO CLI
 * 
 * @param cliVersion - The version of the MSDO CLI to install. Also accepts 'latest' or 'latestprerelease' values.
 */
export async function install(cliVersion: string) {
    console.log('Installing Microsoft Security DevOps Cli...');

    if (process.env.MSDO_FILEPATH) {
        console.log(`MSDO CLI File Path overriden by %MSDO_FILEPATH%: ${process.env.MSDO_FILEPATH}`);
        return;
    }

    if (process.env.MSDO_DIRECTORY) {
        console.log(`MSDO CLI Directory overriden by %MSDO_DIRECTORY%: ${process.env.MSDO_DIRECTORY}`);

        // Set the msdo file path
        let msdoFilePath = path.join(process.env.MSDO_DIRECTORY, 'guardian');
        tl.debug(`msdoFilePath = ${msdoFilePath}`);

        process.env.MSDO_FILEPATH = msdoFilePath;
        return;
    }
    
    let packageName = resolvePackageName();

    // initialize the _msdo directory
    let agentDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_msdo');
    tl.debug(`agentDirectory = ${agentDirectory}`);
    this.ensureDirectory(agentDirectory);

    let agentPackagesDirectory = process.env.MSDO_PACKAGES_DIRECTORY;
    if (!agentPackagesDirectory) {
        agentPackagesDirectory = path.join(agentDirectory, 'packages');
        tl.debug(`agentPackagesDirectory = ${agentPackagesDirectory}`);
        this.ensureDirectory(agentPackagesDirectory);
        process.env.MSDO_PACKAGES_DIRECTORY = agentPackagesDirectory;
    }

    let agentVersionsDirectory = path.join(agentDirectory, 'versions');
    tl.debug(`agentVersionsDirectory = ${agentVersionsDirectory}`);
    this.ensureDirectory(agentVersionsDirectory);

    let msdoVersionsDirectory = path.join(agentVersionsDirectory, 'microsoft.security.devops.cli');
    tl.debug(`msdoVersionsDirectory = ${msdoVersionsDirectory}`);

    if (this.isInstalled(msdoVersionsDirectory, cliVersion)) {
        return;
    }

    let failed = false;
    let attempts = 0;
    let maxAttempts = 2;

    let serviceIndexUrl = "https://pkgs.dev.azure.com/SecurityTools/_packaging/Guardian/nuget/v3/index.json";
    let response: nuget.InstallNuGetPackageResponse;

    do {
        failed = false;
        try {
            response = await nuget.install(
                serviceIndexUrl,
                packageName,
                cliVersion,
                agentVersionsDirectory);
        } catch (error) {
            failed = true;
            attempts += 1;
            if (attempts > maxAttempts) {
                throw new Error(`Failed to install the Guardian CLI nuget package: ${error}`);
            }
        }
    } while (failed);

    setMsdoVariables(msdoVersionsDirectory, packageName, cliVersion);
}

/**
 * Resolves the name of the Guardian CLI package to install based on the current platform
 * 
 * @returns the name of the Guardian CLI package to install
 */
function resolvePackageName(): string {
    let packageName: string;
    if (process.env.MSDO_DOTNETDEPENDENTPACKAGE) {
        packageName = 'Microsoft.Security.DevOps.Cli';
    }
    // else if (process.platform == 'win32') {
    //     packageName = 'Microsoft.Security.DevOps.Cli.win-x64';
    // } else if (process.platform == 'linux') {
    //     packageName = 'Microsoft.Security.DevOps.Cli.linux-x64';
    // }
    else {
        packageName = 'Microsoft.Security.DevOps.Cli';
    }
    tl.debug(`packageName = ${packageName}`);
    return packageName;
}

/**
 * Checks if the MSDO CLI is already installed
 * 
 * @param gdnPackagesDirectory - The directory where the Guardian CLI packages are installed
 * @param packageName - The name of the Guardian CLI package to install
 * @param cliVersion - The version of the Guardian CLI to install
 * @returns true if the Guardian CLI is already installed, false otherwise
 */
function isInstalled(
    versionsDirectory: string,
    packageName: string,
    cliVersion: string): boolean {
    let installed = false;

    if (common.isLatest(cliVersion)) {
        tl.debug(`MSDO CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
        return installed;
    }

    setMsdoVariables(versionsDirectory, packageName, cliVersion);
    
    if (fs.existsSync(process.env.MSDO_DIRECTORY)) {
        console.log(`MSDO CLI v${cliVersion} already installed.`);
        installed = true;
    }

    return installed;
}

function setMsdoVariables(
    msdoPackagesDirectory: string,
    packageName: string,
    cliVersion: string): void {
    let msdoPackageDirectory = path.join(msdoPackagesDirectory, `${packageName}.${cliVersion}`);
    tl.debug(`msdoPackageDirectory = ${msdoPackageDirectory}`);

    let msdoDirectory = path.join(msdoPackageDirectory, 'tools');
    tl.debug(`msdoDirectory = ${msdoDirectory}`);

    let msdoFilePath = path.join(msdoDirectory, 'guardian');
    tl.debug(`msdoFilePath = ${msdoFilePath}`);

    process.env.MSDO_DIRECTORY = msdoDirectory;
    process.env.MSDO_FILEPATH = msdoFilePath;

    if (!fs.existsSync(process.env.MSDO_FILEPATH)) {
        throw `MSDO CLI v${cliVersion} was not found after installation. Expected location: ${msdoFilePath}`
    }
}