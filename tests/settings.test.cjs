const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function fixture(saved) {
  const classes = new Set();
  const properties = new Map();
  const context = {
    module: { exports: {} },
    require: () => ({ Plugin: class {}, SuggestModal: class {}, PluginSettingTab: class {}, WidgetType: class {} }),
    document: {
      body: { classList: {
        toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
        remove: (name) => classes.delete(name),
      } },
      documentElement: { style: {
        setProperty: (key, value) => properties.set(key, value),
        removeProperty: (key) => properties.delete(key),
      } },
      querySelectorAll: () => [],
    },
  };
  vm.runInNewContext(source, context);
  const plugin = new context.module.exports();
  plugin.loadData = async () => saved;
  plugin.saveData = async (data) => { plugin.persisted = JSON.parse(JSON.stringify(data)); };
  return { plugin, classes, properties };
}

test('defaults and legacy Mac settings migrate without overriding explicit choices', async () => {
  for (const [saved, expected] of [[null, false], [{codeBlockPreset:'mac'}, true], [{codeBlockPreset:'dracula'}, false], [{codeBlockPreset:'mac',showMacTrafficLights:false}, false], [{codeBlockPreset:'none',showMacTrafficLights:true}, true]]) {
    const { plugin } = fixture(saved);
    await plugin.loadSettings();
    assert.equal(plugin.settings.showMacTrafficLights, expected);
    await plugin.saveSettings();
    const restored = fixture(plugin.persisted).plugin;
    await restored.loadSettings();
    assert.equal(restored.settings.showMacTrafficLights, expected);
  }
});

test('every preset supports an independent live toggle; switching presets clears old classes', async () => {
  const { plugin, classes } = fixture(null);
  await plugin.loadSettings();
  for (const preset of ['one-dark-pro', 'mac', 'zhihu', 'github', 'vscode', 'notion', 'dracula', 'custom', 'none']) {
    plugin.settings.codeBlockPreset = preset;
    for (const enabled of [true, false]) {
      plugin.settings.showMacTrafficLights = enabled;
      plugin.applySettings();
      assert.equal(classes.has('siyuan-code-mac-traffic-lights'), enabled);
      assert.deepEqual([...classes].filter(c => c.startsWith('siyuan-code-preset-')), preset === 'none' ? [] : [`siyuan-code-preset-${preset}`]);
    }
  }
});

test('unload clears the new theme, dots and custom properties', async () => {
  const { plugin, classes, properties } = fixture({codeBlockPreset:'one-dark-pro',showMacTrafficLights:true});
  await plugin.loadSettings();
  plugin.applySettings();
  plugin.onunload();
  assert.equal(classes.size, 0);
  assert.equal(properties.size, 0);
});
