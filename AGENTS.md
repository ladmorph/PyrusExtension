# Project workflow

The user wants completed changes in this project published to https://github.com/ladmorph/PyrusExtension after each requested update. Run the relevant checks, commit the completed changes, and publish them to the repository. Preserve remote changes and do not force-push. Do not upload browser diagnostics, recordings, credentials, or real Pyrus data. Report the published commit and any unresolved limitation.

The browser extension runs without npm dependencies. Development tests use jsdom; install development dependencies and run npm test. Synthetic DOM fixtures are not a substitute for validation against real Pyrus.
