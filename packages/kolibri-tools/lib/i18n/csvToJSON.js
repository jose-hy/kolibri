const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const logging = require('../logging');
const { forEachPathInfo, parseCSVDefinitions, toLocale } = require('./utils');
const { getAllMessagesFromEntryFiles, getAllMessagesFromFilePath } = require('./astUtils');

module.exports = function(pathInfo, ignore, langInfo, localeDataFolder, verbose) {
  const languageInfo = require(langInfo);
  // A map per webpack bundle designating which messages
  // are needed for full translation. Will be a map from:
  // name to an array of message ids of format namespace.key.
  const requiredMessages = {};
  const allDefaultMessages = {};
  forEachPathInfo(pathInfo, pathData => {
    const moduleFilePath = pathData.moduleFilePath;
    const name = pathData.name;
    logging.info(`Gathering required string ids for ${name}`);
    let messages;
    if (pathData.entry) {
      messages = getAllMessagesFromEntryFiles(pathData.entry, moduleFilePath, ignore, verbose);
    } else {
      messages = getAllMessagesFromFilePath(moduleFilePath, ignore, verbose);
    }
    requiredMessages[name] = Object.keys(messages);
    Object.assign(allDefaultMessages, messages);
    logging.info(`Gathered ${requiredMessages[name].length} required string ids for ${name}`);
  });
  for (const langObject of languageInfo) {
    const crowdinCode = langObject['crowdin_code'];
    const intlCode = langObject['intl_code'];
    logging.info(
      `Converting CSV files to JSON for crowdin code ${crowdinCode} / Intl code ${intlCode}`
    );
    const csvDefinitions = parseCSVDefinitions(localeDataFolder, intlCode);
    let messagesExist = false;
    const localeFolder = path.join(localeDataFolder, toLocale(intlCode), 'LC_MESSAGES');
    for (const name in requiredMessages) {
      // An object for storing our messages.
      const messages = {};
      for (const msg of requiredMessages[name]) {
        const definition = csvDefinitions.find(o => o['Identifier'] === msg);
        if (intlCode === 'en') {
          messages[msg] = allDefaultMessages[msg].message;
          continue;
        }
        if (definition) {
          messages[msg] = definition['Translation'];
        } else {
          logging.error(`Could not find translation for message ${msg} in CSV files`);
        }
      }
      mkdirp.sync(localeFolder);
      const filename = path.join(localeFolder, name + '-messages.json');
      if (Object.keys(messages).length) {
        fs.writeFileSync(
          filename,
          // pretty print and sort keys
          JSON.stringify(messages, Object.keys(messages).sort(), 2),
          { encoding: 'utf-8' }
        );
        messagesExist = true;
      } else {
        try {
          fs.unlinkSync(filename);
        } catch (err) {} // eslint-disable-line no-empty
      }
    }
    if (messagesExist) {
      fs.writeFileSync(
        path.join(localeFolder, 'README.md'),
        'The JSON messages files in this folder were generated by kolibri-tools csvToJSON.js\n'
      );
    }
  }
};
