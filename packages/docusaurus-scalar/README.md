# Docusaurus Scalar

Render API documentation with [Scalar](https://github.com/scalar/scalar) in [Docusaurus](https://docusaurus.io/).

This is a Docusaurus plugin based on [`@scalar/docusaurus`](https://github.com/scalar/scalar/blob/main/packages/docusaurus/README.md), and [`@docusaurus/plugin-content-docs`](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs) allowing for OpenAPI specs to be dynamically loaded from directories.

## Usage

### Navigation Config

| Name       | Type     | Default     | Description                                                                                              |
| ---------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `label`    | `string` | `undefined` | The label to give the API in the nav bar.                                                                |
| `category` | `string` |             | The category to group the APIs under.                                                                    |
| `route`    | `string` |             | The URL route path to apply to the API. If this is defined at multiple levels, the paths will be joined. |

### Plugin Config

To use the plugin, you'll need to add it to the plugins section of your Docusaurus config. The plugin supports the configuration properties outlined in the [`@scalar/api-reference` documentation](https://github.com/scalar/scalar/tree/main/packages/api-reference#configuration).

| Name             | Type                                        | Default          | Description                                                     |
| ---------------- | ------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| `nav`            | [`NavConfig`](#navigation-config)           |                  |                                                                 |
| `route`          | [`RouteConfig`](#route-config)              |                  |                                                                 |
| `paths`          | [`PathConfig[]`](#path-config) \| `boolean` | See `PathConfig` | An array of or path configurations to load specifications from. |
| `configurations` | `PluginConfig`\*                            | `undefined`      | Nested `PluginConfig` objects, excluding `nav` and `paths`      |

### Path Config

The path objects similarly support most of the configuration properties outlined in the [`@scalar/api-reference` documentation](https://github.com/scalar/scalar/tree/main/packages/api-reference#configuration), with the exclusion of `spec`. There are, instead, some additional properties:

| Name      | Type                              | Default                    | Description                                                                                                |
| --------- | --------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `path`    | `string`                          | `./specifications`                | The path to load specifications from                                                                       |
| `include` | `string[]`                        | `['**/*.{json,yml,yaml}']` | An array of include globs. For multi-file specifications, ensure that the glob only matches the root file. |
| `exclude` | `string[]`                        | `undefined`                | An array of exclude globs.                                                                                 |
| `nav`     | [`NavConfig`](#navigation-config) |                            |                                                                                                            |

### Configuration Overrides

It is possible to override configuration set on the `ScalarOptions` object by setting it at a more specific level, e.g. on a specific instance within `configurations` or `paths`.

### Example Configuration

```ts
import type { ScalarOptions } from '@scalar/docusaurus'

plugins: [
  [
    'docusaurus-scalar',
      {
        showSidebar: true,
        hideModels: true,
        routePath: "specs",
        paths: [
          {
            path: "./specifications/",
            include: ["openapi_petstore.json"],
          },
          {
            path: "./specifications/group/",
            include: "**/*.{json,yaml,yml}",
            showSidebar: false,
            category: "Static Group",
            routePath: "route_path",
          },
          {
            path: "./specifications/group/",
            include: "**/*.{json,yaml,yml}",
            hideModels: false,
          },
        ],
        configurations: [
          {
            spec: {
              url: "https://petstore3.swagger.io/api/v3/openapi.json",
            },
          },
        ],
      } as ScalarOptions,
  ],
],
```
