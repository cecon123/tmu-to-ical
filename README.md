# 🐵 Xmonkey Userscript: Bun + TypeScript Boilerplate

Create powerful Xmonkey (Greasemonkey/Tampermonkey/Violentmonkey/...) userscripts using the all-in-one lightning-fast [Bun](https://bun.sh) JavaScript runtime and TypeScript.

## Features

* Full TypeScript support
* SCSS and HTML injection capabilities
* Automatic generation of the [userscript metadata block](https://violentmonkey.github.io/api/metadata-block/) based on package information
* Local development server with watching-building for seamless development

## Getting Started

1. Install Bun. We recommend using the [mise method](https://mise.jdx.dev/lang/bun.html), but you can also follow the official [Bun installation guide](https://bun.sh/docs/installation).

2. Create a new project using this template:

    ```sh
    bun create genzj/bun-ts-userscript-starter my-awesome-userscript
    cd my-awesome-userscript
    ```

3. Start the development server:

    ```sh
    bun dev
    ```

4. Open <http://localhost:3000> in your browser to install the built userscript. This template includes an example that injects into <https://example.com>, so you can visit that site to verify the installation.

5. Every time you update your code, the `bun dev` command will rebuild the userscript. You'll need to update or reinstall the script either from your Xmonkey dashboard or by refreshing <http://localhost:3000>.

## Building

```bash
# Create a minified build for distribution
bun run build

# Generate a non-minified development build with inline sourcemap
bun run build:dev

# Watch for changes and automatically run development builds
bun run build:watch

# View additional building options
bun run build.ts --help
```

## Release Your Script

### Option 1: By GitHub Release

Pushing a tag to GitHub triggers the workflow that builds and creates the
corresponding release. The release is initially created as a draft and
prerelease, allowing you to test it before publishing it to users. To adjust
this behavior, edit the `Release` step in
`.github/workflows/publish-release-action.yml`.

With this option, the `build.ts` script sets `updateURL` and `downloadURL` to
the artifact of the latest release, e.g.,
`https://github.com/genzj/bun-ts-userscript-starter/releases/latest/download/bun-ts-userscript-starter.user.js`.
Share this link with users for installing or upgrading to the latest version.

### Option 2: By Git Commit

If GitHub Actions are not an option (e.g., if you're using a self-hosted
repository), you can commit the release builds directly. First, stop the dev
server (if running) by pressing `Ctrl+C`. Then, run `bun run build` and commit
and push the `dist/*/*.user.js` file to the repo.

In this case, the `build.ts` script will set `updateURL` and `downloadURL` to
the raw file in your repository, e.g.,
`https://github.com/genzj/bun-ts-userscript-starter/raw/main/dist/bun-ts-userscript-starter.user.js`.
You may need to update `build.ts` if your repository is hosted outside GitHub,
or use the Option 3 below.

### Option 3: Out Of Band (Handle Release Yourself)

For other release channels, override the `updateURL` and `downloadURL` to point
to your actual release URL. To do this, edit the `userscriptHeader` section in
`package.json`, for example:

```json
"userscriptHeader": {
    "@updateURL": "https://g3r.top/bun-ts-userscript",
    "@downloadURL": "https://g3r.top/bun-ts-userscript"
},
```

## Updating the Userscript Metadata Block

Customize the userscript metadata through the `userscriptHeader` field in `package.json`. Any key in this field will be written to the metadata block. Values can be either a string (for single-line entries) or an array of strings (for multi-line entries). See the `@match` and `@grant` fields in the template's `package.json` for examples.

## Roadmap

* [x] Improve README documentation
* [x] Implement watch and auto-reload for development
* [x] Serve the generated userscript during watch mode
* [x] Support serving with proper filename, update URL, and download URL
* [x] Add GitHub Action for automated releases
* [ ] Import icon and generate base64 for `@icon`

## Acknowledgements

This project draws significant inspiration from the [Greasemonkey Webpack + TypeScript boilerplate](https://github.com/tarkant/greasemonkey-webpack-typescript-boilerplate).

## ⏲ Changelog

* v1.0.2: Add release channel supports
* v1.0.1: Add GitHub Action
* v1.0.0: First release
