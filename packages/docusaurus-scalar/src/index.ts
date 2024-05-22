import type { LoadContext, Plugin } from "@docusaurus/types";
import type {
  ReferenceConfiguration,
} from "@scalar/api-reference";
import { resolve } from "@scalar/openapi-parser";
import * as fsp from "fs/promises";
import { globby } from "globby";
import _ from "lodash";
import path from "path";
import logger from "@docusaurus/logger";

export type BaseConfig = Omit<
  ScalarOptions,
  "spec" | "paths" | "configurations"
>;

export type SpecConfig = ReferenceConfiguration & {
  label?: string;
  routePath?: string;
  category?: string;
};

export type PathConfig = Omit<SpecConfig, "spec"> & {
  path: string;
  include?: string[];
  exclude?: string[];
};

export type ScalarOptions = SpecConfig & {
  paths?: PathConfig[] | boolean;
  configurations?: SpecConfig[];
};

export const DEFAULT_SCALAR_PATH_CONFIG = {
  path: "./specifications",
  include: ["**/*.{json,yml,yaml}"],
} as PathConfig;

export const DEFAULT_SCALAR_OPTIONS = {
  paths: [DEFAULT_SCALAR_PATH_CONFIG],
  routeBasePath: "specifications",
} as ScalarOptions;

async function loadSpecsFromPath(
  paths: PathConfig[],
  baseConfig: BaseConfig
): Promise<SpecConfig[]> {
  return (
    await Promise.all(
      paths.map(async (source): Promise<SpecConfig | SpecConfig[]> => {
        const files = await findSpecFiles(source);
        const fileSpecs = (
          await Promise.all(
            files.map(async (file) => {
              try {
                return await loadSpecFromFile(source, file, baseConfig);
              } catch (e) {
                if (typeof e === "string") {
                  logger.warn(e.toUpperCase());
                } else if (e instanceof Error) {
                  logger.warn(e.message);
                }
                return [];
              }
            })
          )
        ).flat();
        logger.info`[Scalar] number=${
          fileSpecs.length
        } specifications loaded from path=${`${source.path}${source.include}`}`;
        return fileSpecs;
      })
    )
  ).flat();
}

async function mergeConfig(
  source: BaseConfig,
  baseConfig: BaseConfig
): Promise<PathConfig | SpecConfig> {
  return Object.fromEntries(
    Object.keys({ ...source, ...baseConfig }).map((key) => {
      const k = key as keyof BaseConfig;
      if (key == "routePath") {
        if (baseConfig[k] && source[k]) {
          return [key, `${baseConfig[k]}/${source[k]}`];
        }
      }
      return [key, source[k] || baseConfig[k]];
    })
  );
}

async function findSpecFiles(source: PathConfig): Promise<string[]> {
  return await Promise.all(
    await globby(source?.include || "*", {
      cwd: source.path,
      ignore: source.exclude,
    })
  );
}

async function loadSpecFromFile(
  source: PathConfig,
  file: string,
  baseConfig: BaseConfig
): Promise<SpecConfig> {
  const { dir, base, ext } = path.parse(file);
  const merged = await mergeConfig(source, baseConfig);
  const config = {
    ...merged,
    spec: {
      content: await fsp.readFile(path.resolve(`${source.path}/${file}`), {
        encoding: "utf-8",
        flag: "r",
      }),
    },
    category: merged?.category || file.split(path.sep).reverse()[1],
    routePath: path.join(
      "/",
      ...[
        merged?.routePath || "",
        ...dir.split(path.sep),
        base.substring(0, base.lastIndexOf(ext)),
      ]
    ),
  } as SpecConfig;
  return await loadSpecFromContent(config);
}

async function loadSpecFromContent(config: SpecConfig): Promise<SpecConfig> {
  if (config.spec?.content) {
    config = {
      // parse the config for a label if none has been provided
      label:
        config.label ||
        (await resolve(config.spec.content)).specification?.info.title,
      ...config,
      // ensure route path is in kebab case
      routePath: `/${path.join(
        ...(config.routePath || "")
          .split("/")
          .map((segment) => _.kebabCase(segment)),
        "/"
      )}`,
    };
  } else {
    throw "Specification content has not been loaded";
  }
  return config;
}

async function loadSpecsFromConfig(
  configs: SpecConfig[],
  baseConfig: BaseConfig
): Promise<SpecConfig[]> {
  return await Promise.all(
    configs.map(async (config) => {
      const merged = {
        ...(await mergeConfig(config, baseConfig)),
        spec: {
          content: config.spec?.content
            ? config.spec.content
            : config.spec?.url
            ? await (await fetch(config.spec.url)).json()
            : undefined,
        },
      };
      return await loadSpecFromContent(merged);
    })
  );
}

async function loadSpecs(options: ScalarOptions): Promise<SpecConfig[]> {
  var { paths, configurations, ...specConfig } = options;
  var configs: SpecConfig[] = [];
  const { spec, ...baseConfig } = specConfig;
  if (paths === false) {
    logger.info`[Scalar] paths disabled`;
  } else {
    if (paths === true || paths === undefined) {
      logger.info`[Scalar] default path used`;
      paths = [DEFAULT_SCALAR_PATH_CONFIG];
    }
    if (paths.length > 0) {
      logger.info`[Scalar] number=${paths.length} paths configured`;
    }
    configs = configs.concat(await loadSpecsFromPath(paths, baseConfig));
  }
  const specs = [
    ...(specConfig.spec ? [specConfig] : []),
    ...(configurations || []),
  ];
  if (specs.length > 0) {
    logger.info`[Scalar] number=${specs.length} specification definitions configured`;
    configs = configs.concat(await loadSpecsFromConfig(specs, baseConfig));
  }
  logger.info`[Scalar] number=${configs.length} specifications loaded`;
  return configs;
}

async function addToNav(context: LoadContext, config: SpecConfig) {
  if (config.label && config.routePath) {
    const specNav = {
      label: config.label,
      to: config.routePath,
      position: "left",
    };
    const navBar = context.siteConfig.themeConfig.navbar as {
      items: Record<string, string | object[]>[];
    };
    // check if nav item has a category
    if (config.category) {
      for (const navItem of navBar.items) {
        // check if category exists
        if (navItem.type === "dropdown" && navItem.label === config.category) {
          (navItem.items as object[]).push(specNav);
          return;
        }
      }
      // create new category
      navBar.items.push({
        type: "dropdown",
        label: config.category,
        items: [specNav],
        position: "left",
      });
    } else {
      (navBar.items as Record<string, string>[]).push(specNav);
    }
  } else {
    logger.warn`[Scalar] spec cannot be added to navigation`;
  }
}

const ScalarDocusaurus = (
  context: LoadContext,
  userOptions: ScalarOptions
): Plugin<SpecConfig[]> => {
  return {
    name: "@scalar/docusaurus",

    async loadContent() {
      return await loadSpecs({
        ...DEFAULT_SCALAR_OPTIONS,
        ...userOptions,
      } as Required<ScalarOptions>);
    },

    async contentLoaded({ content, actions }) {
      const { addRoute } = actions;
      content.forEach((contentItem) => {
        // Add entry to nav
        addToNav(context, contentItem);
        if (contentItem.routePath && contentItem.label) {
          addRoute({
            path: contentItem.routePath,
            component: path.resolve(__dirname, "./ScalarDocusaurus"),
            exact: true,
            configuration: contentItem as ReferenceConfiguration,
          });
        }
      });
    },
  };
};

export default ScalarDocusaurus;
