import type { LoadContext, Plugin } from "@docusaurus/types";
import type { ReferenceConfiguration } from "@scalar/api-reference";
import {
  OpenAPI,
  dereference,
  fetchUrlsPlugin,
  load,
  readFilesPlugin,
  validate,
} from "@scalar/openapi-parser";
import { globby } from "globby";
import _ from "lodash";
import path from "path";
import logger from "@docusaurus/logger";
import * as fsp from "fs/promises";

export type NavConfig = {
  category?: string; // not supported if categoryFromPath is true
  label?: string; // not supported if labelFromSpec is true
  labelFromSpec?: boolean;
  categoryFromPath?: boolean;
  labelFromFilename?: boolean;
};

export const DEFAULT_NAV_CONFIG = {
  labelFromSpec: true,
  categoryFromPath: true,
} as NavConfig;

export type RouteConfig = {
  route?: string;
  routeFromSpec?: boolean;
  routeFromPath?: boolean;
};

export const DEFAULT_ROUTE_CONFIG = {
  route: "scalar",
  routeFromSpec: true,
  routeFromPath: false,
} as RouteConfig;

export type SpecConfig = Omit<ReferenceConfiguration, "theme"> & {
  nav?: NavConfig;
  route?: RouteConfig;
};

export type PathConfig = Omit<SpecConfig, "spec"> & {
  path: string;
  include?: string[];
  exclude?: string[];
};

export const DEFAULT_PATH_CONFIG = {
  path: "./specifications",
  include: ["**/*.{json,yml,yaml}"],
} as PathConfig;

export type SourcelessConfig = Omit<SpecConfig, "spec">;

export type ScalarConfig = SpecConfig & {
  nav?: NavConfig;
  route?: RouteConfig;
  paths?: PathConfig[] | boolean;
  configurations?: SpecConfig[];
};

export const DEFAULT_SCALAR_CONFIG = {
  nav: DEFAULT_NAV_CONFIG,
  route: DEFAULT_ROUTE_CONFIG,
  paths: [DEFAULT_PATH_CONFIG],
  configurations: [],
} as ScalarConfig;

async function loadSpecsFromPath(
  paths: PathConfig[],
  baseConfig: SourcelessConfig
): Promise<SpecConfig[]> {
  return (
    await Promise.all(
      paths.map(async (source): Promise<SpecConfig[]> => {
        const stats = await fsp.stat(source.path);
        // merge config with base config
        const merged = mergeConfig(source, baseConfig) as PathConfig;
        const fileSpecs = await Promise.all(
          (stats.isDirectory()
            ? await globby(source?.include || "*", {
                cwd: source.path,
                ignore: source.exclude,
              })
            : stats.isFile()
            ? [source.path]
            : []
          ).map(async (file) => await loadSpecFromFile(merged, file))
        );
        logger.info`[Scalar] number=${
          fileSpecs.length
        } specifications loaded from path=${`${source.path}/${source.include}`}`;
        return fileSpecs;
      })
    )
  ).flat();
}

function mergeConfig(
  source: SourcelessConfig,
  base: SourcelessConfig
): SourcelessConfig {
  const { nav: sourceNav, route: sourceRoute, ...sourceConfig } = source;
  const { nav: baseNav, route: baseRoute, ...baseConfig } = base;
  const merge = (a: any, b: any) => {
    return Object.fromEntries(
      Object.keys({ ...a, ...b }).map((key) => {
        a = a || {};
        const k = key as keyof typeof a;
        // return source config or the base config
        return [key, typeof a[k] !== 'undefined' ? a[k] : b[k]];
      })
    );
  };
  return {
    ...merge(sourceConfig, baseConfig),
    nav: merge(sourceNav, baseNav),
    route: merge(sourceRoute, baseRoute),
  };
}

async function loadSpecContent(
  specPath: string
): Promise<OpenAPI.Document | undefined> {
  const fileSystem = await load(specPath, {
    plugins: [readFilesPlugin(), fetchUrlsPlugin()],
  });
  return (await dereference(fileSystem)).schema;
}

async function loadSpecFromFile(
  source: PathConfig,
  file: string
): Promise<SpecConfig> {
  const { dir, name } = path.parse(file);
  // get files and resolve any references
  const config = {
    ...source,
    spec: {
      content: await loadSpecContent(`${source.path}/${file}`),
    },
    nav: {
      ...source.nav,
      // check whether label from filename should be used
      label: source?.nav?.labelFromFilename ? name : undefined,
      // use a set category or use parent folder
      category:
        source?.nav?.category || source?.nav?.categoryFromPath
          ? file.split(path.sep)[0]
          : undefined,
    },
    route: {
      ...source.route,
      route: path.join(
        "/",
        ...[
          source?.route?.route || "",
          ...(source?.route?.routeFromPath
            ? [...dir.split(path.sep), name]
            : []),
        ]
      ),
    },
  } as SpecConfig;
  return await loadSpecFromContent(config);
}

async function loadSpecFromContent(config: SpecConfig): Promise<SpecConfig> {
  if (config.spec?.content) {
    // validate config
    const validated = await validate(config.spec.content);
    return {
      ...config,
      nav: config.nav
        ? // if label provided, use that
          {
            label: config.nav.labelFromSpec
              ? validated.specification?.info?.title
              : config.nav.label,
            category: config.nav.category,
          }
        : undefined,
      // ensure route is in kebab case
      route: {
        route: path.join(
          "/",
          ...[
            config?.route?.route || "",
            config?.route?.routeFromSpec
              ? validated.specification?.info?.title || ""
              : "",
          ].flatMap((seg) => seg.split("/").map((s) => _.kebabCase(s)))
        ),
      },
    };
  } else {
    throw "Specification content has not been loaded";
  }
}

async function loadSpecsFromConfig(
  configs: SpecConfig[],
  baseConfig: SourcelessConfig
): Promise<SpecConfig[]> {
  return await Promise.all(
    configs.map(async (config) => {
      const merged = {
        // merge current config with base config
        ...mergeConfig(config, baseConfig),
        // if url, download to content
        spec: {
          content: config.spec?.content
            ? config.spec.content
            : config.spec?.url
            ? await loadSpecContent(config.spec.url)
            : undefined,
        },
      };
      return await loadSpecFromContent(merged);
    })
  );
}

async function loadSpecs(options: ScalarConfig): Promise<SpecConfig[]> {
  // split out config
  var { paths, configurations, ...specConfig } = options;
  const { spec, ...baseConfig } = specConfig;
  // create config store
  var configs: SpecConfig[] = [];
  if (paths === false) {
    logger.info`[Scalar] paths disabled`;
  } else {
    // read paths config
    if (paths === true || paths === undefined) {
      logger.info`[Scalar] default path used`;
      paths = [DEFAULT_PATH_CONFIG];
    }
    if (paths.length > 0) {
      logger.info`[Scalar] number=${paths.length} paths configured`;
    }
    // load specs from paths and add to config store
    configs = configs.concat(await loadSpecsFromPath(paths, baseConfig));
  }
  // join base spec and nested configuration specs
  const specs = [
    ...(specConfig.spec ? [specConfig] : []),
    ...(configurations || []),
  ];
  if (specs.length > 0) {
    // load specs from config and add to config store
    logger.info`[Scalar] number=${specs.length} specification definitions configured`;
    configs = configs.concat(await loadSpecsFromConfig(specs, baseConfig));
  }
  logger.info`[Scalar] number=${configs.length} specifications loaded`;
  return configs;
}

async function addToNav(context: LoadContext, config: SpecConfig) {
  if (config.nav) {
    // only add to nav if label and route are configured
    if (config.nav.label && config.route?.route) {
      const specNav = {
        label: config.nav.label,
        to: config.route.route,
        position: "left",
      };
      const navBar = context.siteConfig.themeConfig.navbar as  {
        items: Record<string, string | object[]>[];
      };
      // check if nav item has a category
      if (config.nav.category) {
        for (const navItem of navBar.items) {
          // check if category exists
          if (
            navItem.type === "dropdown" &&
            navItem.label === config.nav.category
          ) {
            // add to nav category
            (navItem.items as object[]).push(specNav);
            return;
          }
        }
        // create new category if it was not found
        navBar.items.push({
          type: "dropdown",
          label: config.nav.category,
          items: [specNav],
          position: "left",
        });
      } else {
        // add directly to nav bar
        (navBar.items as Record<string, string>[]).push(specNav);
      }
    } else {
      logger.warn`[Scalar] spec cannot be added to navigation`;
    }
  }
}

const ScalarDocusaurus = (
  context: LoadContext,
  userOptions: ScalarConfig
): Plugin<SpecConfig[]> => {
  const options = mergeConfig(
    userOptions,
    DEFAULT_SCALAR_CONFIG
  ) as ScalarConfig;
  return {
    name: "@scalar/docusaurus",

    getPathsToWatch() {
      if (options.paths === false) {
        return [] as string[];
      } else if (options.paths === true || options.paths === undefined) {
        options.paths = [DEFAULT_PATH_CONFIG];
      }
      const pathsToWatch = options.paths.flatMap((pathEntry) => {
        if (pathEntry.include) {
          return pathEntry.include.map((include) => {
            return `${pathEntry.path}/${include}`;
          }) as string[];
        } else {
          return [];
        }
      });
      return pathsToWatch;
    },

    async loadContent() {
      return await loadSpecs(options);
    },

    async contentLoaded({ content, actions }) {
      const { addRoute } = actions;
      content.forEach((contentItem) => {
        if (contentItem.route?.route) {
          // add route
          addRoute({
            path: contentItem.route.route,
            component: path.resolve(__dirname, "./ScalarDocusaurus"),
            exact: true,
            configuration: contentItem as ReferenceConfiguration,
          });
          if (contentItem.nav?.label) {
            // Add entry to nav
            addToNav(context, contentItem);
          }
        }
      });
    },
  };
};

export default ScalarDocusaurus;
