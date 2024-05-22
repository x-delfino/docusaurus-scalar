# Docusaurus Scalar

Render API documentation with [Scalar](https://github.com/scalar/scalar) in [Docusaurus](https://docusaurus.io/).

This is a Docusaurus plugin based on [`@scalar/docusaurus`](https://github.com/scalar/scalar/blob/main/packages/docusaurus/README.md), and [`@docusaurus/plugin-content-docs`](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs) allowing for OpenAPI specs to be dynamically loaded from directories.

## Usage

To use the plugin, you'll need to add it to the plugins section of your Docusaurus config. The plugin supports the configuration properties outlined in the [`@scalar/api-reference` documentation](https://github.com/scalar/scalar/tree/main/packages/api-reference#configuration).

Additionally the configuration supports:

- `paths`: An array of `path` objects (listed below)
- `configurations`: An array of nested configurations (excluding further nested `paths` or `configurations`)
- `label`: The label to give to the API in the nav bar
- `routePath`: The routing path to use for this configuration or its children
- `category`: The category for to use for this configuration or its children

### Path Object

The path objects similarly support most of the configuration properties outlined in the [`@scalar/api-reference` documentation](https://github.com/scalar/scalar/tree/main/packages/api-reference#configuration), with the exclusion of `spec`. There are, instead, some additional properties:

- `path`: The path to load specifications from
- `include`: An array of include globs to use
- `exclude`: An array of exclude globs to use

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