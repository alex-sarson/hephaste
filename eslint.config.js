// Root flat config — ESLint discovers this from any package's `eslint .`
// invocation by walking up from cwd, so individual packages don't need
// their own eslint.config.js. See packages/config/eslint.base.js.
import { baseConfig } from "./packages/config/eslint.base.js";

export default baseConfig;
