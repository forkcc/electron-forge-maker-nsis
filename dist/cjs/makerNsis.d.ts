import MakerBase, { MakerOptions } from '@electron-forge/maker-base';
import { MakerNSISConfig } from './config';
export default class MakerNSIS extends MakerBase<MakerNSISConfig> {
    name: string;
    defaultPlatforms: string[];
    isSupportedOnCurrentPlatform(): boolean;
    /**
     * Normalize a dev-style version (e.g. `153.0.0-dev`) into the numeric
     * `x.y.z.w` form required by NSIS/Windows installers.
     */
    normalizeVersionForNsis(appDir: string): Promise<void>;
    codesign(options: MakerOptions, outPath: string): Promise<void>;
    /**
     * Maybe creates an app-update.yml, compatible with electron-updater
     */
    createAppUpdateYml(options: MakerOptions, outPath: string): Promise<void>;
    createChannelYml(options: MakerOptions, installerPath: string): Promise<string | undefined>;
    make(options: MakerOptions): Promise<string[]>;
}
