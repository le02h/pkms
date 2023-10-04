/*\
title: $:/plugins/tiddlywiki/filesystem/filesystemadaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising with the local filesystem via node.js APIs

\*/
(function () {
  /* jslint node: true, browser: true */
  /* global $tw: false */
  'use strict'

  // Get a reference to the file system
  const fs = $tw.node ? require('fs') : null
  const path = $tw.node ? require('path') : null
  const cache = {}
  const knownFields = [
    'bag', 'created', 'creator', 'modified', 'modifier', 'permissions',
    'recipe', 'revision', 'tags', 'text', 'title', 'type', 'uri'

  ]

  function FileSystemAdaptor (options) {
    this.wiki = options.wiki
    this.boot = options.boot || $tw.boot
    this.logger = new $tw.utils.Logger('filesystem', { colour: 'blue' })
    // Create the <wiki>/tiddlers folder if it doesn't exist
    $tw.utils.createDirectory(this.boot.wikiTiddlersPath)
  }

  FileSystemAdaptor.prototype.name = 'filesystem'

  FileSystemAdaptor.prototype.supportsLazyLoading = false

  FileSystemAdaptor.prototype.isReady = function () {
    // The file system adaptor is always ready
    return true
  }

  FileSystemAdaptor.prototype.getSystemJsonFilePath = function () {
    return path.resolve(this.boot.wikiTiddlersPath, 'system.json')
  }

  FileSystemAdaptor.prototype.getDataJsonFileName = function () {
    const title = '$:/config/DataJsonFileName'
    const defaultFilename = 'data.json'
    return this.wiki.tiddlerExists(title) ? this.wiki.getTiddlerText(title, defaultFilename) : defaultFilename
  }

  FileSystemAdaptor.prototype.getDataJsonFilePath = function (filename) {
    filename = filename || this.getDataJsonFileName()
    return path.resolve(this.boot.wikiTiddlersPath, filename)
  }

  FileSystemAdaptor.prototype.serializeTiddlerFields = function (tiddler, exclude) {
    exclude = exclude || []
    const fields = {}
    $tw.utils.each(tiddler.fields, (field, name) => {
      if (!exclude.includes(name)) {
        const value = tiddler.getFieldString(name)
        fields[name] = value
      }
    })
    if (fields.revision) delete fields.revision
    return fields
  }

  FileSystemAdaptor.prototype.shouldSaveInCache = function (tiddler) {
    const titles = ['$:/StoryList', '$:/Import']
    return !!tiddler.fields['draft.of'] || titles.includes(tiddler.fields.title)
  }

  FileSystemAdaptor.prototype.getTiddlerInfo = function (tiddler) {
    // Returns the existing fileInfo for the tiddler. To regenerate, call getTiddlerFileInfo().
    const title = tiddler.fields.title
    return this.boot.files[title]
  }

  /**
   * Return a fileInfo object for a tiddler, creating it if necessary:
   *
   * filepath: the absolute path to the file containing the tiddler
   * type: the type of the tiddler file (NOT the type of the tiddler -- see below)
   * hasMetaFile: true if the file also has a companion .meta file
   *
   * The boot process populates this.boot.files for each of the tiddler files that it loads.
   * The type is found by looking up the extension in $tw.config.fileExtensionInfo (eg "application/x-tiddler" for ".tid" files).
   *
   * It is the responsibility of the filesystem adaptor to update this.boot.files for new files that are created.
   */
  FileSystemAdaptor.prototype.getTiddlerFileInfo = function (tiddler, callback) {
    const title = tiddler.fields.title
    const filters = title => this.wiki.tiddlerExists(title) ? this.wiki.getTiddlerText(title, '').split('\n') : []
    const fileInfo = this.boot.files[title]
    const newInfo = $tw.utils.generateTiddlerFileInfo(tiddler, {
      directory: this.boot.wikiTiddlersPath,
      pathFilters: filters('$:/config/FileSystemPaths'),
      extFilters: filters('$:/config/FileSystemExtensions'),
      wiki: this.wiki,
      fileInfo
    })
    if (fileInfo && this.wiki.isSystemTiddler(title)) {
      newInfo.filepath = fileInfo.filepath
    }
    callback(null, newInfo)
  }

  /**
   * Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
   */
  FileSystemAdaptor.prototype.saveTiddler = function (tiddler, callback, options) {
    const title = tiddler.fields.title
    if (this.shouldSaveInCache(tiddler)) {
      cache[title] = tiddler.fields
      callback(null)
    } else if (this.wiki.isSystemTiddler(title)) {
      this.saveSystemTiddler(tiddler, options, callback)
    } else if (/^image\/.*$/.test(tiddler.fields.type)) {
      this.saveTiddlerToFile(tiddler, options, callback)
    } else {
      this.saveDataTiddler(tiddler, options, callback)
    }
  }

  FileSystemAdaptor.prototype.saveSystemTiddler = function (tiddler, options, callback) {
    const title = tiddler.fields.title
    const fileInfo = this.boot.files[title]
    if (fileInfo) {
      if (path.basename(fileInfo.filepath) === 'system.json') {
        this.saveTiddlerToSystemJson(tiddler, { isNewTiddler: false }, callback)
      } else {
        this.saveTiddlerToFile(tiddler, options, callback)
      }
    } else if (tiddler.fields.type === 'application/json') {
      this.saveTiddlerToFile(tiddler, options, callback)
    } else {
      this.saveTiddlerToSystemJson(tiddler, { isNewTiddler: true }, callback)
    }
  }

  FileSystemAdaptor.prototype.saveTiddlerToSystemJson = function (tiddler, options, callback) {
    const filepath = this.getSystemJsonFilePath()
    const tiddlers = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf-8')) : []
    const exclude = ['creator', 'created', 'modifier', 'modified', '__new']
    const fields = this.serializeTiddlerFields(tiddler, exclude)
    if (options.isNewTiddler) {
      tiddlers.push(fields)
    } else {
      const index = tiddlers.findIndex(t => t.title === fields.title)
      tiddlers[index] = fields
    }

    this.writeToJsonFile(filepath, tiddlers, (err) => {
      const fileInfo = {
        filepath,
        hasMetaFile: false,
        type: fields.type
      }
      this.boot.files[fields.title] = fileInfo
      callback(err, fileInfo)
    })
  }

  FileSystemAdaptor.prototype.saveDataTiddler = function (tiddler, options, callback) {
    const title = tiddler.fields.title
    const fileInfo = this.boot.files[title]
    const filename = this.getDataJsonFileName()
    this.saveTiddlerToDataJson(tiddler, {
      isNewTiddler: (typeof fileInfo === 'undefined'),
      filename
    }, callback)
  }

  FileSystemAdaptor.prototype.saveTiddlerToDataJson = function (tiddler, options, callback) {
    const filepath = this.getDataJsonFilePath(options.filename)
    const tiddlers = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf-8')) : []
    const fields = this.serializeTiddlerFields(tiddler)
    if (options.isNewTiddler) {
      tiddlers.push(fields)
    } else {
      const index = tiddlers.findIndex(t => t.title === fields.title)
      tiddlers[index] = fields
    }

    this.writeToJsonFile(filepath, tiddlers, (err) => {
      const fileInfo = {
        filepath,
        hasMetaFile: false,
        type: fields.type
      }
      this.boot.files[fields.title] = fileInfo
      callback(err, fileInfo)
    })
  }

  FileSystemAdaptor.prototype.saveTiddlerToFile = function (tiddler, options, callback) {
    const self = this
    const title = tiddler.fields.title
    const syncerInfo = options.tiddlerInfo || {}
    this.getTiddlerFileInfo(tiddler, function (err, fileInfo) {
      if (err) return callback(err)

      $tw.utils.saveTiddlerToFile(tiddler, fileInfo, function (err, fileInfo) {
        if (err) {
          if ((err.code === 'EPERM' || err.code === 'EACCES') && err.syscall === 'open') {
            fileInfo = fileInfo || self.boot.files[tiddler.fields.title]
            fileInfo.writeError = true
            self.boot.files[tiddler.fields.title] = fileInfo
            $tw.syncer.logger.log(`Sync failed for "${title}" and will be retried with encoded filepath`, encodeURIComponent(fileInfo.filepath))
          }
          return callback(err)
        }

        // Store new boot info only after successful writes
        self.boot.files[tiddler.fields.title] = fileInfo
        // Cleanup duplicates if the file moved or changed extensions
        const options = {
          adaptorInfo: syncerInfo.adaptorInfo || {},
          bootInfo: fileInfo || {},
          title: tiddler.fields.title
        }
        $tw.utils.cleanupTiddlerFiles(options, function (err, fileInfo) {
          if (err) return callback(err)
          return callback(null, fileInfo)
        })
      })
    })
  }

  /**
   * Load a tiddler and invoke the callback with (err,tiddlerFields)
   * We don't need to implement loading for the file system adaptor, because all the tiddler files will have been loaded during the boot process.
   */
  FileSystemAdaptor.prototype.loadTiddler = function (title, callback) {
    callback(null, null)
  }

  /**
   * Delete a tiddler and invoke the callback with (err)
   */
  FileSystemAdaptor.prototype.deleteTiddler = function (title, callback, options) {
    if (cache[title]) {
      delete cache[title]
      callback(null, null)
    } else if (this.wiki.isSystemTiddler(title)) {
      this.removeSystemTiddler(title, callback)
    } else {
      const fileInfo = this.boot.files[title]
      if (fileInfo) {
        if (/^image\/.*$/.test(fileInfo.type)) {
          this.removeTiddlerFile(title, callback)
        } else {
          this.removeDataTiddler(title, callback)
        }
      } else {
        callback(null, null)
      }
    }
  }

  FileSystemAdaptor.prototype.removeSystemTiddler = function (title, callback) {
    const fileInfo = this.boot.files[title]
    if (fileInfo) {
      if (path.basename(fileInfo.filepath) === 'system.json') {
        const filepath = fileInfo.filepath
        const tiddlers = (fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf-8')) : []).filter(t => t.title !== title)
        this.writeToJsonFile(filepath, tiddlers, (err) => {
          if (err) return callback(err)
          delete this.boot.files[title]
          callback(null, fileInfo)
        })
      } else {
        this.removeTiddlerFile(title, callback)
      }
    } else {
      callback(null, null)
    }
  }

  FileSystemAdaptor.prototype.removeDataTiddler = function (title, callback) {
    const fileInfo = this.boot.files[title]
    const filename = this.getDataJsonFileName()
    if (fileInfo) {
      if (path.basename(fileInfo.filepath) === filename) {
        const filepath = fileInfo.filepath
        const tiddlers = (fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf-8')) : []).filter(t => t.title !== title)
        this.writeToJsonFile(filepath, tiddlers, (err) => {
          if (err) return callback(err)
          delete this.boot.files[title]
          callback(null, fileInfo)
        })
      } else {
        this.removeTiddlerFile(title, callback)
      }
    } else {
      callback(null, null)
    }
  }

  FileSystemAdaptor.prototype.removeTiddlerFile = function (title, callback) {
    const self = this
    const fileInfo = this.boot.files[title]
    $tw.utils.deleteTiddlerFile(fileInfo, function (err, fileInfo) {
      if (err) {
        if ((err.code === 'EPERM' || err.code === 'EACCES') && err.syscall === 'unlink') {
          // Error deleting the file on disk, should fail gracefully
          $tw.syncer.displayError(`Server desynchronized. Error deleting file for deleted tiddler "${title}"`, err)
          return callback(null, fileInfo)
        } else {
          return callback(err)
        }
      }

      // Remove the tiddler from self.boot.files & return null adaptorInfo
      self.removeTiddlerFileInfo(title)
      return callback(null, null)
    })
  }

  /**
   * Delete a tiddler in cache, without modifying file system.
   */
  FileSystemAdaptor.prototype.removeTiddlerFileInfo = function (title) {
    // Only delete the tiddler info if we have writable information for the file
    if (this.boot.files[title]) {
      delete this.boot.files[title]
    }
  }

  FileSystemAdaptor.prototype.writeToJsonFile = function (filepath, tiddlers, callback) {
    let content
    if (path.basename(filepath) === 'system.json') {
      content = '[' + tiddlers.map(v => JSON.stringify(v, null, 2)).join(', ') + ']'
    } else {
      content = '[\n' + tiddlers.map(v => JSON.stringify(v)).join(',\n') + '\n]'
    }

    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, '[]')
    }
    fs.rename(filepath, `${filepath}.swp`, function (err) {
      if (err) return callback(err)
      fs.writeFile(filepath, content, function (err) {
        if (err) return callback(err)
        fs.unlink(`${filepath}.swp`, callback)
      })
    })
  }

  if ($tw.node) {
    exports.adaptorClass = FileSystemAdaptor
  }
})()
