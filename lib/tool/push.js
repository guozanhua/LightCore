/**
 * @file 上传代码
 * @module push
 * @author r2space@gmail.com
 * @version 1.0.0
 */

'use strict';

const log     = require('../log')
  , context   = require('../http/context')
  , helper    = require('../helper')
  , rider     = require('../model/datarider')
  , file      = require('../model/file')
  , CONST     = require('../constant')
  , path      = require('path')
  , fs        = require('fs')
  , async     = require('async');

let folder        = process.cwd()
  , binarySuffix  = []
  , binaryFile    = []
  , lang          = 'node';


exports.start = function (root, callback) {

  if (typeof root === 'function') {
    callback = root;
    root = null;
  }

  if (root) {
    folder = root;
  }

  // 获取代码类型说明文件，包含非上传对象文件，二进制文件的定义
  const setting = getConfig(root);
  lang = setting.lang;
  binarySuffix = getBinarySuffix(setting.binary.suffix);
  binaryFile = getBinaryFile(setting.binary.file);

  const handler = new context().create('000000000000000000000001', process.env.APPNAME, CONST.SYSTEM_DB_PREFIX);
  rider.code.list(handler, {select: 'name, md5', condition: {lang: lang}}, (err, codes) => {

    let add = [], update = [], remove = [];

    // 遍历所有本地文件，对比md5
    const current = helper.tree(folder, getIgnore(setting.ignore)).map(item => item.file.replace(folder, ''));
    current.forEach(f => {
      const code = codes.items.find(item => item.name === f)
        , md5 = helper.fileMd5(path.join(folder, f));

      if (code) {
        // md5不同则更新文件
        if (code.md5 !== md5) {
          update.push({file: f, md5: md5});
        }
      } else {
        // 不存在则添加文件
        add.push({file: f, md5: md5});
      }
    });

    // 遍历所有数据库中内容，确定被删除的文件
    codes.items.forEach(code => {
      if (!current.includes(code.name)) {
        remove.push({file: code.name});
      }
    });

    async.series([
      (done) => removeCode(handler, remove, done),
      (done) => updateCode(handler, update, done),
      (done) => addCode(handler, add, done)
    ], err => {
      if (err) {
        return callback(err);
      }

      callback(null, {add: add, remove: remove, update: update})
    });
  });

};


function getConfig(root) {

  // 查看根目录
  let isExist = fs.existsSync(path.join(root, 'config.yml'));
  if (isExist) {
    return helper.yamlLoader('config.yml', root);
  }

  // 尝试查看Java的资源目录
  isExist = fs.existsSync(path.join(folder, 'src/main/resources', 'config.yml'));
  if (isExist) {
    return helper.yamlLoader('config.yml', path.join(root, 'src/main/resources'));
  }

  return {};
}


function addCode(handler, items, callback) {

  async.each(items, (item, next) => {
    log.debug(`>> add ${item.file}`);

    const binary = isBinary(item.file);
    let data = {
      name: item.file, type: binary ? 'binary' : 'code', app: handler.domain, md5: item.md5, lang: lang
    };

    if (binary) {
      return addFile(handler, path.join(folder, item.file), (err, result) => {
        if (err) {
          return next(err);
        }

        data.source = result[0]._id;
        rider.code.add(handler, {data: data}, next);
      });
    }

    data.source = fs.readFileSync(path.join(folder, item.file), 'utf8');
    rider.code.add(handler, {data: data}, next);
  }, callback);
}


function updateCode(handler, items, callback) {

  async.each(items, (item, next) => {
    log.debug(`>> update ${item.file}`);

    const binary = isBinary(item.file);

    if (binary) {
      return addFile(handler, path.join(folder, item.file), (err, result) => {
        if (err) {
          return next(err);
        }

        rider.code.update(handler, {
          data: {source: result[0]._id, md5: item.md5},
          condition: {name: item.file, lang: lang}
        }, next);
      });
    }

    const data = {source: fs.readFileSync(path.join(folder, item.file), 'utf8'), md5: item.md5};
    rider.code.update(handler, {condition: {name: item.file, lang: lang}, data: data}, next);
  }, callback);
}


function removeCode(handler, items, callback) {

  async.each(items, (item, next) => {
    log.debug(`>> remove ${item.file}`);
    rider.code.remove(handler, {condition: {name: item.file, lang: lang}}, next);
  }, callback);
}


function isBinary(file) {

  const isSuffixMatch = binarySuffix.findIndex(item => path.extname(file) === item) >= 0;
  const isFileNameMatch = binaryFile.findIndex(item => file.substr(1) === item) >= 0;

  return isSuffixMatch || isFileNameMatch;
}


function addFile(handler, f, callback) {
  const data = {
    originalFilename: path.basename(f),
    headers: {'content-type': 'application/octet-stream'},
    path: f,
    base: path.dirname(f)
  };

  return file.add(handler.copy({files: [data]}), callback);
}


/**
 * 代码上传时，忽略的本地文件或文件夹
 * @param ignore
 * @returns {Array.<string>}
 */
function getIgnore(ignore) {
  return ['.git', '.idea', '.vscode', 'node_modules'].concat(ignore);
}


/**
 * 代码上传时，作为二进制文件上传的文件后缀
 * @param suffix
 * @returns {Array.<string>}
 */
function getBinarySuffix(suffix) {
  return ['.png', '.jpg', '.jpeg', '.ico', '.gif', '.eot', '.svg', '.ttf', '.woff', '.woff2', '.pdf', '.xlsx'].concat(suffix);
}


/**
 * 代码上传时，作为二进制文件上传的文件名称
 * @param file
 * @returns {Array.<*>}
 */
function getBinaryFile(file) {
  return [].concat(file);
}
