/**
 * @file 通用工具类
 * @module light.core.helper
 * @author r2space@gmail.com
 * @version 1.0.0
 */

'use strict';

const fs    = require('fs')
  , path    = require('path')
  , ejs     = require('ejs')
  , os      = require('os')
  , xml     = require('xml2js')
  , util    = require('util')
  , _       = require('lodash')
  , packer  = require('zip-stream')
  , async   = require('async')
  , qr      = require('qr-image')
  , uuid    = require('uuid')
  , numeral = require('numeral')
  , moment  = require('moment-timezone')
  , jwt     = require('jwt-simple')
  , crypto  = require('crypto')
  , cookie  = require('cookie')
  , yaml    = require('js-yaml')
  , mpath   = require('./mpath');

/**
 * @desc 在对象里取值，或给对象赋值
 * - set 方法使用 lodash 的set方法
 * - get 方法使用 mpath 的get方法
 *
 * mpath的set方法的缺点 - 内嵌文档空时，不能自动创建子文档 set({}, 'a.b.c', 10) 无法生成 {a: {b: {c: 10}}}
 * lodash的get方法的缺点 - 不能获取数组的值 _.get([{a: {b:1}}, {a: {b:2}}], 'a.b') 无法获取 [1, 2]
 */
exports.get = function(object, path){
  return mpath.get(path, object);
};

exports.set = _.set;

/**
 * @desc 简单生成随机4位字符串
 * @returns {String} 随机4位字符串
 */
exports.randomGUID4 = function () {
  return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
};

/**
 * @desc 生成随机8位字符串, 会有重复数据生成<br>
 *   - GUID : Global Unique Identifier
 * @returns {String} 随机8位字符串
 */
exports.randomGUID8 = function () {
  return exports.randomGUID4() + exports.randomGUID4();
};

/**
 * @desc 随机12位字符串, 会有重复数据生成<br>
 *   - GUID : Global Unique Identifier
 * @returns {String} 随机12位字符串
 */
exports.randomGUID12 = function () {
  return exports.randomGUID4() + exports.randomGUID4() + exports.randomGUID4();
};

/**
 * @desc 生成唯一识别号<br>
 *   - GUID : Universally Unique Identifier
 * @returns {String} uuid
 */
exports.uuid = function () {
  return uuid.v4();
};

/**
 * @desc 读取模板文件，替换参数，生成结果文件，如果没有指定结果文件，则返回解析后的字符串
 * @param {String} templateFile ejs模板文件
 * @param {Object} parameters 模板文件参数对象
 * @param {String} resultFile 结果文件，如果没有指定则以字符串的形式返回解析的内容
 * @returns {String} 解析内容
 */
exports.ejsParser = function (templateFile, parameters, resultFile) {

  // 读取模板文件
  var template = fs.readFileSync(templateFile, "utf8");

  // 转换模板文件
  ejs.open = undefined;
  ejs.close = undefined;
  var result = ejs.render(template, parameters);

  // 没有指定输出文件，则返回字符串
  if (!resultFile) {
    return result;
  }

  // 输出文件
  fs.writeFileSync(resultFile, result);
  return undefined;
};

exports.ejsFormat = ejs.render;

/**
 * ejs版本2开始, 使用方法发生变化, 请直接使用util.ejs
 *
 * @desc 格式化EJS模板字符串
 * @param {String} templateString ejs模板文件
 * @param {Object} parameters 模板文件参数对象
 * @returns {String} 格式化结果
 */
//exports.ejsFormat = function (templateString, parameters) {
//
//  // 改变模板参数标识
//  ejs.open = "{{";
//  ejs.close = "}}";
//
//  var result = ejs.render(templateString, parameters);
//
//  // 回复模板参数标识
//  ejs.open = undefined;
//  ejs.close = undefined;
//  return result;
//};

/**
 * @desc 判断客户端是否是mozilla浏览器
 * @param {Object} req 请求对象
 * @returns {Boolean} 返回是否
 */
exports.isBrowser = function (req) {
  var userAgent = req.headers["user-agent"] || "";
  return userAgent.toLowerCase().match(/mozilla.*/i);
};

/**
 * @desc 判断客户端是否是移动设备
 * @param req
 * @returns {Array|{index: number, input: string}}
 */
exports.isMobile = function (req) {
  return exports.isApple(req) ||
    exports.isAndroid(req) ||
    exports.isWindows(req) ||
    exports.isReactNative(req) ||
    exports.isElectron(req);
};

/**
 * @desc 是否是苹果设备上的请求
 * @param req
 * @returns {Array|{index: number, input: string}}
 */
exports.isApple = function (req) {
  var ua = req.headers["user-agent"] || "";
  return ua.match(/iPhone/i) || ua.match(/iPod/i) || ua.match(/iPad/i);
};

// 网络上的代码, 未确认
exports.isAndroid = function (req) {
  var ua = req.headers["user-agent"] || "";
  return ua.match(/(?=.*\bAndroid\b)(?=.*\bMobile\b)/i) || ua.match(/Android/i);
};

// 网络上的代码, 未测试
exports.isWindows = function (req) {
  var ua = req.headers["user-agent"] || "";
  return ua.match(/IEMobile/i) || ua.match(/(?=.*\bWindows\b)(?=.*\bARM\b)/i);
};

exports.isReactNative = function(req){
  return req.headers["light-react-native"] || false;
};

exports.isElectron = function(req){
  let ua = req.headers["user-agent"] || "";
  return ua.toLowerCase().match(/electron/i);
};

/**
 * @desc 判断请求是ajax请求
 * @param {Object} req 请求
 * @returns {Boolean} 返回是否
 */
exports.isAjax = function (req) {
  return req.headers && req.headers['x-requested-with'] && req.headers['x-requested-with'] == 'XMLHttpRequest';
};

/**
 * @desc 返回客户端类型
 * @param {Object} req 请求
 * @returns {String} 浏览器返回‘mozilla‘，ios应用返回’app名称‘
 */
exports.clientType = function (req) {
  var userAgent = req.headers["user-agent"].toLowerCase();
  return userAgent.split("/")[0];
};

/**
 * @desc 获取AP服务器IP地址的数组，获取的IP地址放到global对象中缓存
 * @returns 返回IP地址
 */
exports.ip = function () {

  if (global.addresses) {
    return global.addresses;
  }

  var interfaces = os.networkInterfaces()
    , addresses = [];

  _.each(interfaces, function (item) {
    _.each(item, function (address) {
      if (address.family === "IPv4" && !address.internal) {
        addresses.push(address.address);
      }
    });
  });

  global.addresses = addresses;
  return global.addresses;
};

/**
 * @desc 获取应用程序情报
 * @returns {Object} 应用程序版本信息等
 */
exports.applicationInfo = function () {

  var app = require(process.cwd() + "/package.json");
  return {
    version: app.version
    , host: os.hostname()
    , application: app.name
    , time: new Date()
  };
};

/**
 * @desc 判断模块是否可以加载
 *  TODO: cwd方法的目录依赖，会因为启动方式，启动目录不同而不准确
 *  TODO: 是否用代码文件存在来判断更加合理？而不是用异常捕获
 * @ignore
 * @param module 模块名称
 * @param path 相对路径
 * @returns {String} 路径
 */
exports.resolve = function (module, path) {
  try {
    return require((path || process.cwd()) + module);
  } catch (e) {
    return undefined;
  }
};


/**
 * @desc 加载给定的字符串，与eval类似
 * @param {String} src 字符串
 * @param {String} filename 加载文件
 * @returns {Object} 加载对象
 */
exports.requireFromString = function (src, filename) {
  var Module = module.constructor;
  var m = new Module();
  m._compile(src, filename);
  return m.exports;
};


/**
 * @desc XML解析器
 * @param {String} file 文件名
 * @param {Function} callback 回调函数，返回解析后结果
 */
exports.xmlParser = function (file, callback) {
  var path = process.cwd() + file;

  if (fs.existsSync(path)) {
    var data = fs.readFileSync(path);
    new xml.Parser().parseString(data, function (err, result) {
      callback(err, result);
    });
    return;
  }

  callback(undefined, {});
};

exports.yamlLoader = function (folder, root) {

  const fullPath = path.join(root || process.cwd(), folder);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return yaml.safeLoad(fs.readFileSync(fullPath, 'utf8'));
};

exports.yamlParser = function (content) {
  return yaml.safeLoad(content);
};

exports.yamlDumper = function (json, option) {

  option = option || {};
  option.flowLevel = 6;

  return yaml.safeDump(json, option);
};

/**
 * @desc 压缩指定的文件列表
 * @param {Array} list 文件数组
 * @param {String|Object} out 输出文件名或者输出流
 * @param {Function} callback 回调函数，返回解析后结果
 */
exports.zipFiles = function (list, out, callback) {

  var archive = new packer()
    , result = []
    , output = _.isString(out) ? fs.createWriteStream(out) : out; // 输出文件名或输出流

  if (list && list.length > 0) {
    async.eachSeries(list, function (file, next) {
      archive.entry(fs.createReadStream(file), {name: path.basename(file)}, function (err, entry) {
        result.push(entry);
        next(err, entry);
      });
    }, function (err) {
      archive.finish();
      if (callback) {
        callback(err, result);
      }
    });
  } else {

    // 生成一个空文件，标识没有内容
    archive.entry("No file.", {name: "NoFile"}, function (err, entry) {
      archive.finish();
      if (callback) {
        callback(err, result);
      }
    });
  }

  archive.pipe(output);
};

/**
 * @desc 生成QRcode
 * @param {String} message 信息
 * @param {String|Object} out 输出文件名或者输出流
 * @param {Function} callback 回调函数，返回解析后结果
 */
exports.qrcode = function (message, out, callback) {

  var png = qr.image(message, {type: "png", ec_level: "L", margin: 1})
    , stream = _.isString(out) ? fs.createWriteStream(out) : out;

  stream.on("close", function () {
    callback();
  });
  png.pipe(stream);
};

/**
 * @desc 删除文件夹
 * @param {String} path 文件夹
 */
exports.rmdir = function (path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function (file) {
      var current = path + "/" + file;
      if (fs.lstatSync(current).isDirectory()) {
        exports.rmdir(current);
      } else {
        fs.unlinkSync(current);
      }
    });
    fs.rmdirSync(path);
  }
};


/**
 * @desc 创建文件夹, 递归创建
 * @param path
 * @param includeFile 给定的path最后一个是文件名
 */
exports.mkdirp = function (path, includeFile) {

  var current = ""
    , folder = path.split("/");

  if (includeFile) {
    folder = folder.slice(0, folder.length - 1);
  }

  _.each(_.compact(folder), function (item) {
    current = current + "/" +  item;
    if (!fs.existsSync(current)) {
      fs.mkdirSync(current);
    }
  });
};

/**
 * @desc 字符串格式化
 * @param {Object} val 数据
 * @param {String} format 格式
 * @param {String} tz 时区
 * @returns {String} 格式化后结果
 */
exports.format = function(val, format, tz) {
  if (exports.isBlank(format)) {
    return val;
  }

  // Format number
  if (_.isNumber(val)) {
    return numeral(val).format(format);
  }

  // Format string
  if (_.isString(val)) {
    return util.format(format, val);
  }

  // Format date
  if (_.isDate(val)) {
    return moment(val).tz(tz || "UTC").format(format);
  }

  return val;
};

/**
 * 获取文件一览，包括子文件夹
 * 允许指定 ignore 和 filter
 * 会忽略 SymbolicLink
 * @param folder
 * @param ignores Array 指定对象外文件或文件夹
 * @param filters Array 文件类型
 * @param result
 * @returns {*|Array}
 */
exports.tree = function (folder, ignores, filters, result = []) {

  // 判断是否是对象外文件或文件夹
  const isIgnore = function (file) {
    if (!ignores || ignores.length <= 0) {
      return false;
    }

    ignores = Array.isArray(ignores) ? ignores : [ignores];

    return ignores.findIndex(ignore => {
        return new RegExp(`^.*/${ignore}$`).test(file);
      }) >= 0;
  };

  // 判断是否只获取指定对象
  const isFilter = function (file) {
    if (!filters || filters.length <= 0) {
      return true;
    }

    filters = Array.isArray(filters) ? filters : [filters];

    return filters.findIndex(filter => {
        return new RegExp(`^.*${filter}$`).test(file);
      }) >= 0;
  };

  fs.readdirSync(folder).forEach(file => {

    const full = path.resolve(folder, file);
    if (isIgnore(full)) {
      return;
    }

    const stats = fs.lstatSync(full);

    // 忽略文件链接
    if (stats.isSymbolicLink()) {
      return;
    }

    // 递归文件夹
    if (stats.isDirectory()) {
      return exports.tree(full, ignores, filters, result);
    }

    if (isFilter(file)) {
      return result.push({file: full, size: stats.size});
    }
  });

  return result;
};


/**
 * @desc 生成JWT(JSON Web Token)
 * @param payload 内容
 * @param secret key
 * @param expires token有效期限
 * @returns {String}
 */
exports.generateToken = function(payload, secret, expires) {

  payload.expires = moment().add(expires, "second").valueOf();

  return jwt.encode(payload, secret, "HS256");
};

/**
 * @desc 解析Token, 如果附带有语言信息，则设定到req中
 * @param req
 * @param secret
 * @returns {*}
 */
exports.decodeToken = function(req, secret) {

  if (req.body && req.body.access_token) {

    req.lang = req.body.lang;
    return jwt.decode(req.body.access_token, secret) || {};
  }

  if (req.query && req.query.access_token) {

    req.lang = req.query.lang;
    return jwt.decode(req.query.access_token, secret) || {};
  }

  if (req.headers["x-access-token"]) {
    return jwt.decode(req.headers["x-access-token"], secret) || {};
  }

  return {};
};

/**
 * @desc 生成SID
 *   这里的生成逻辑与 express-session 相同，可以使用这个SID模拟用户的认证cookie
 *   使用这种生成sid的方式，是因为可以用画面操作一样的方式存取session
 * @param sessionKey sessionKey
 * @param sessionID sessionID
 * @param sessionSecret sessionSecret
 * @param option
 * @returns {*|string}
 */
exports.generateSID = function (sessionKey, sessionID, sessionSecret, option) {

  var signed = "s:"
    + sessionID
    + "."
    + crypto.createHmac("sha256", sessionSecret).update(sessionID).digest("base64").replace(/\=+$/, "");

  return cookie.serialize(sessionKey, signed, option);
};

/**
 * 获取cookie中的值
 * @param req
 * @param key
 * @returns {*}
 */
exports.getCookie = function (req, key) {
  req.headers = req.headers || {};
  return cookie.parse(req.headers.cookie || "")[key];
};


/**
 * @desc 判断文件是否存在
 *  由于node的exists方法变成了deprecated, 所以提供该方法
 * @param path
 */
exports.fileExists = function (path) {
  try {
    fs.statSync(path);
  } catch (err) {
    if (err.code == "ENOENT") {
      return false;
    }
    throw err;
  }

  return true;
};


/**
 * 获取文件的MD5
 * @param filename
 * @returns {*}
 */
exports.fileMd5 = function (filename) {

  const BUFFER_SIZE = 8192, fd = fs.openSync(filename, 'r');

  let hash = crypto.createHash('md5')
    , buffer = new Buffer(BUFFER_SIZE)
    , bytes;

  try {
    do {
      bytes = fs.readSync(fd, buffer, 0, BUFFER_SIZE);
      hash.update(buffer.slice(0, bytes));
    } while (bytes === BUFFER_SIZE)
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest('hex')
};

exports.isBlank = function (str) {
  if (typeof str === 'undefined' || str === null || Number.isNaN(str)) {
    return true;
  }

  return (/^\s*$/).test(str);
};

exports.isMySQL = function () {
  return typeof process.env.LIGHTMYSQL_HOST !== 'undefined';
};

exports.isSQLServer = function () {
  return typeof process.env.LIGHTSQLSERVER_HOST !== 'undefined';
};
