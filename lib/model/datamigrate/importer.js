/**
 * @file ETL处理，执行数据导入
 *
 *  数据的路径
 *   通过 clean - extract - transform - load 阶段，导入到指定collection中
 *
 *  自定义的controller，可以定义下面的方法，加载数据的时候会被调用
 *   init
 *   before
 *   parse
 *   after
 *   valid
 *   end
 *
 * @author r2space@gmail.com
 * @module lib.model.importer
 * @version 1.0.0
 */

'use strict';

const async   = require('async')
  , _         = require('underscore')
  , excel     = require('./excel')
  , common    = require('./common')
  , rider     = require('../datarider')
  , helper    = require('../../helper')
  , Model     = require('../../db/mongo/model')
  , validator = require('../../validator')
  , Error     = require('../../error')
  , logger    = require('../../log')
  , PREFIX    = 'tmp.';


class ETL {

  /**
   * 构造函数
   * @param handler
   * @param options
   */
  constructor(handler, options) {

    options = options || {};

    // 错误内容
    this.log = [];
    this.total = 0;
    this.success = 0;
    this.inserted = [];
    this.updated = [];

    this.uid = handler.uid;
    this.handler = handler;
    this.handler.domain = handler.domain || process.env.APPNAME;

    this.schema = options.schema;
    this.type = options.type;
    this.mappings = options.mappings || [];
    this.uniqueKey = options.uniqueKey;
    this.validator = options.validator;

    this.allowError = options.allowError;
    this.allowErrorMax = options.allowErrorMax;
    this.allowUpdate = options.allowUpdate;

    // 自定义controller
    if (options.class) {
      const isTest = (typeof global.it === 'function');
      this.controller = helper.resolve(`${isTest ? '/test' : ''}/controllers/${options.class}`);
    }

    let db = handler.db || {}, table;

    // 存放源数据的collection
    table = options.primitive || PREFIX + helper.randomGUID4();
    this.primitive = new Model(this.handler.domain, undefined, table, {user: db.user, pass: db.pass});

    // 存放加工好的数据collection
    table = options.processed || PREFIX + helper.randomGUID4();
    this.processed = new Model(this.handler.domain, undefined, table, {user: db.user, pass: db.pass});

    // 最终的表
    this.target = rider[this.schema];
  }


  /**
   * 执行导入功能
   * @param callback
   */
  exec(callback) {

    async.series([
      done => this.initialize(done),
      done => this.extract(done),
      done => this.transform(done),
      done => this.load(done),
      done => this.end(done)
    ], err => {
      callback(err, {
          total   : this.total,
          success : this.success,
          error   : this.log.length > 0 ? this.log : err,
          inserted: this.inserted,
          updated : this.updated
        }
      );
    });
  }


  /**
   * 导入前初始化
   * @param callback
   */
  initialize(callback) {

    logger.debug('etl initialize.');

    async.series([
      next => this.primitive.dropCollection(next),
      next => this.processed.dropCollection(next)
    ], err => {
      if (err) {
        return callback(err);
      }

      common.init(this.controller, this.handler, this.primitive, callback);
    });
  }


  /**
   * 加载数据
   * @param callback
   */
  extract(callback) {

    logger.debug('etl extract.');

    if (this.type === 'excel') {

      let sheets = excel.parse(this.handler.params.files[0].path, this.mappings)
        , data   = [];

      sheets.forEach(sheet => sheet.forEach(row => data.push(row)));

      // 尝试调用用户自定义的 befor 方法
      return common.before(this.controller, this.handler, data, (err, newData) => {
        if (err) {
          return callback(err);
        }

        data = newData || data;

        async.eachSeries(data, (row, next) => {

          Object.keys(row).forEach(key => {
            if (key.indexOf('.') > 0) {
              helper.set(row, key, row[key]);
              delete row[key];
            }
          });

          this.primitive.add(row, next);
        }, callback);
      });
    }

    if (this.type === 'csv') {
    }

    if (this.type === 'mongodb') {
      let source = this.name, more = true
        , keepID = _.isUndefined(source.keepID) ? false : source.keepID
        , model  = new Model(source.domain, source.code, source.table, {user: source.user, pass: source.pass});

      model.getCursor({}, (err, curosr) => {
        async.whilst(
          () => {
            return more;
          },
          loop => {
            curosr.next((err, row) => {
              more = row;
              if (more) {
                if (keepID === false) {
                  delete row['_id'];
                }
                return this.primitive.add(row, loop);
              }
              loop();
            });
          }, callback);
      });
    }
  }


  /**
   * 转换数据
   * @param callback
   */
  transform(callback) {

    logger.debug('etl transform.');

    let more = true;

    this.primitive.getCursor({}, (err, curosr) => {
      async.whilst(() => more,
        loop => {

          async.waterfall([

            // 遍历所有数据
            next => curosr.next(next),

            // 测试是否有下一条数据
            (row, next) => {
              more = row;
              if (more) {
                this.total = this.total + 1;
                return next(undefined, row);
              }

              loop();
            },

            // 处理每行数据
            (row, next) => this.parse(row, next),

            // 将数据插入到, 存放加工完数据的表中
            (hasError, parsed, next) => {
              // 校验有错误的时候, 判断是否停止处理还是继续处理剩下的数据
              if (hasError) {
                if (this.allowError && (this.allowErrorMax > 0 && this.log.length < this.allowErrorMax)) {
                  return next();
                }
                return next(new Error.parameter.ParamError());
              }

              this.processed.add(parsed, next);
            }
          ], loop);
        },
        callback
      );
    });
  }


  /**
   * 向最终表添加数据
   * @param row
   * @param callback
   */
  add(row, callback) {

    logger.debug('etl add.');

    // 从数据库导入时, 不通过rider进行数据转换, 而直接用model插入数据
    if (this.type === 'mongodb') {
      const db  = this.handler.db || {}
        , model = new Model(this.handler.domain, undefined, this.schema, {user: db.user, pass: db.pass});

      return model.add(row, callback);
    }

    // 当允许更新的FLG被设定, 需要判断是否有 uniqueKey 相匹配的数据
    if (this.allowUpdate) {

      const condition = _.reduce(this.uniqueKey, (memo, key) => {
        memo[key] = row[key];
        return memo;
      }, {valid: 1});

      // 判断有, 则更新, 没有就插入一条新数据
      this.handler.params.free = condition;
      return this.target.get(this.handler, (err, result) => {
        if (err) {
          return callback(err);
        }

        this.handler.strict = false;
        if (result && !_.isEmpty(result)) {
          this.handler.params.free = condition;
          this.handler.params.data = row;
          this.target.update(this.handler, (err, res) => {
            if (err) {
              return callback(err);
            }
            this.updated.push(res._id);
            callback();
          });
        } else {
          this.handler.params.data = row;
          this.target.add(this.handler, (err, res) => {
            if (err) {
              return callback(err);
            }
            this.inserted.push(res._id);
            callback();
          });
        }
      });
    }

    this.handler.params.data = row;
    this.target.add(this.handler, callback);
  }


  /**
   * 处理每行数据
   * @param row
   * @param callback
   */
  parse(row, callback) {

    logger.debug('etl parse.');

    let hasError = false;

    async.waterfall([

      // 类型转换
      next => {
        async.eachSeries(this.mappings, (mapping, loop) => {

          row._original = row._original || {};

          if (mapping.sanitize) {
            const key = mapping.variable || mapping.key;
            helper.set(row, key, validator.format(this.handler, helper.get(row, key), mapping.sanitize));
          }

          // 获取关联内容
          this.handler.params.data = row;
          common.getLinkData(this.handler, mapping, loop);
        }, next);
      },

      // 尝试调用开发者自定义的类型转换
      next => {
        common.parse(this.controller, this.handler, row, err => {
          next(err);
        });
      },

      // 数据校验
      next => {
        this.handler.params.data = row;
        validator.isValid(this.handler, this.validator, (err, message) => {
          if (err) {
            hasError = true;
            _.each(message, item => item.row = this.total);
            this.log = _.union(this.log, message);
          }

          next();
        });
      },

      // 尝试调用开发者自定义的数据校验
      next => {
        common.valid(this.controller, this.handler, row, (err, message) => {
          if (err) {
            hasError = true;
            _.each(message, item => item.row = this.total);
            this.log = _.union(this.log, message);
          }

          next();
        });
      }

    ], err => {
      delete row['_original'];
      callback(err, hasError, row);
    });
  }


  /**
   * 后期处理
   * @param callback
   */
  load(callback) {

    logger.debug('etl load.');

    // 有校验错误, 且 allowError = false 则不更新最终数据库
    if (!this.allowError && this.log.length > 0) {
      return callback();
    }

    this.processed.getBy({}, (err, data) => {
      if (err) {
        return callback(err);
      }

      // 尝试调用用户的方法
      common.after(this.controller, this.handler, data, (err, newData) => {
        if (err) {
          return callback(err);
        }

        data = newData || data;

        async.eachSeries(data, (row, next) => {

          delete row['_id'];
          this.add(row, err => {
            if (!err) {
              this.success = this.success + 1;
            }
            next(err);
          });
        }, callback);
      });
    });
  }


  /**
   * 结束处理, 如果是自动生成的临时表, 则执行完以后自动删除
   * @param callback
   */
  end(callback) {

    logger.debug('etl end.');

    const result = {
      total   : this.total,
      success : this.success,
      error   : this.log,
      inserted: this.inserted,
      updated : this.updated
    };

    common.end(this.controller, this.handler, result, err => {
      if (err) {
        return callback(err);
      }

      async.series([
        next => {
          if (this.primitive.code.startsWith(PREFIX)) {
            return this.primitive.dropCollection(next);
          }
          next();
        },
        next => {
          if (this.processed.code.startsWith(PREFIX)) {
            return this.processed.dropCollection(next);
          }
          next();
        }
      ], callback);

    });
  }

}

module.exports = ETL;