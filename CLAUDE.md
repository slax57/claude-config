# claude-config

## Plugin versions

Every change to a plugin under `plugins/<name>/` bumps the `version` in that plugin's
`.claude-plugin/plugin.json`, in the same branch. Follow [semver](https://semver.org):

- **major**: a breaking change (a skill, command, argument or setting removed or renamed,
  behaviour a user relies on changed);
- **minor**: a backward-compatible feature (new skill, new argument, new capability);
- **patch**: a fix or a wording change with no new capability.

While a plugin is below `1.0.0`, a breaking change bumps the minor instead.
