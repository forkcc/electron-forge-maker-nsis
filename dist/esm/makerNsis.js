import MakerBase from '@electron-forge/maker-base';
import { sign } from '@electron/windows-sign';
import { buildForge } from 'app-builder-lib';
import fs from 'fs-extra';
import path from 'path';
import debug from 'debug';
import { getChannelYml, getAppUpdateYml } from 'electron-updater-yaml';
const log = debug('electron-forge:maker:nsis');
export default class MakerNSIS extends MakerBase {
    constructor() {
        super(...arguments);
        this.name = 'nsis';
        this.defaultPlatforms = ['win32'];
    }
    isSupportedOnCurrentPlatform() {
        return process.platform === 'win32';
    }
    /**
     * Normalize a dev-style version (e.g. `153.0.0-dev`) into the numeric
     * `x.y.z.w` form required by NSIS/Windows installers.
     */
    async normalizeVersionForNsis(appDir) {
        const pkgPath = path.join(appDir, 'package.json');
        if (!(await fs.pathExists(pkgPath)))
            return;
        const pkg = await fs.readJson(pkgPath);
        const version = String(pkg.version || '');
        const numeric = /^\d+(\.\d+){0,3}$/.test(version);
        if (numeric)
            return;
        const parts = version.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
        while (parts.length < 4)
            parts.push(0);
        const normalized = parts.slice(0, 4).join('.');
        log(`Normalizing version for NSIS: ${version} -> ${normalized}`);
        pkg.version = normalized;
        await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    }
    async codesign(options, outPath) {
        if (this.config.codesign) {
            try {
                await sign(Object.assign(Object.assign({}, this.config.codesign), { appDirectory: outPath }));
            }
            catch (error) {
                console.error('Failed to codesign using @electron/windows-sign. Check your config and the output for details!', error);
                throw error;
            }
            // Setup signing. If these variables are set, app-builder-lib will actually
            // codesign.
            if (!process.env.CSC_LINK && this.config.codesign.certificateFile) {
                log(`Setting process.env.CSC_LINK to ${this.config.codesign.certificateFile}`);
                process.env.CSC_LINK = this.config.codesign.certificateFile;
            }
            if (!process.env.CSC_KEY_PASSWORD && this.config.codesign.certificatePassword) {
                log('Setting process.env.CSC_KEY_PASSWORD to the passed password');
                process.env.CSC_KEY_PASSWORD = this.config.codesign.certificatePassword;
            }
        }
        else {
            log('Skipping code signing, if you need it set \'config.codesign\'');
        }
    }
    /**
     * Maybe creates an app-update.yml, compatible with electron-updater
     */
    async createAppUpdateYml(options, outPath) {
        if (!this.config.updater)
            return;
        const ymlContents = await getAppUpdateYml({
            url: this.config.updater.url,
            name: options.appName,
            channel: this.config.updater.channel,
            updaterCacheDirName: this.config.updater.updaterCacheDirName,
            publisherName: this.config.updater.publisherName
        });
        log(`Writing app-update.yml to ${outPath}`, ymlContents);
        await fs.writeFile(path.join(outPath, 'resources', 'app-update.yml'), ymlContents, 'utf8');
    }
    async createChannelYml(options, installerPath) {
        if (!this.config.updater)
            return;
        const channel = this.config.updater.channel || 'latest';
        const version = options.packageJSON.version;
        const channelFilePath = path.resolve(installerPath, `${channel}.yml`);
        const ymlContents = await getChannelYml({
            installerPath,
            version,
            platform: 'win32'
        });
        log(`Writing ${channel}.yml to ${installerPath}`, ymlContents);
        await fs.writeFile(channelFilePath, ymlContents, 'utf8');
        return channelFilePath;
    }
    async make(options) {
        // Copy everything to a temporary location
        const { makeDir, targetArch } = options;
        const outPath = path.resolve(makeDir, `nsis/${targetArch}`);
        const tmpPath = path.resolve(makeDir, `nsis/${targetArch}-tmp`);
        const result = [];
        log(`Emptying directories: ${tmpPath}, ${outPath}`);
        await fs.emptyDir(tmpPath);
        await fs.emptyDir(outPath);
        log(`Copying contents of ${options.dir} to ${tmpPath}`);
        await fs.copy(options.dir, tmpPath);
        // Fingerprint Electron uses dev-style versions (e.g. 153.0.0-dev).
        // NSIS requires a numeric x.y.z.w version, so normalize the version in
        // the copied package.json before app-builder-lib reads it.
        await this.normalizeVersionForNsis(tmpPath);
        // Codesign
        await this.codesign(options, tmpPath);
        // Updater: Create the app-update.yml that goes _into_ the
        // application package
        await this.createAppUpdateYml(options, tmpPath);
        // Actually make the NSIS
        log(`Calling app-builder-lib's buildForge() with ${tmpPath}`);
        const additionalConfig = this.config.getAppBuilderConfig
            ? await this.config.getAppBuilderConfig()
            : {};
        const output = await buildForge({ dir: tmpPath }, {
            win: [
                `nsis:${options.targetArch}`
            ],
            config: Object.assign({ directories: {
                    output: path.resolve(tmpPath, '..', 'make')
                } }, additionalConfig)
        });
        // Move the output to the actual output folder, app-builder-lib might get it wrong
        log('Received output files', output);
        for (const file of output) {
            const filePath = path.resolve(outPath, path.basename(file));
            result.push(filePath);
            await fs.move(file, filePath);
        }
        // Updater: Create the channel file that goes _next to_ the installer
        const channelFile = await this.createChannelYml(options, outPath);
        if (channelFile)
            result.push(channelFile);
        // Cleanup
        await fs.remove(tmpPath);
        await fs.remove(path.resolve(makeDir, 'nsis/make'));
        return result;
    }
}
//# sourceMappingURL=makerNsis.js.map