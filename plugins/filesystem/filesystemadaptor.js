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
    } else {
      this.saveTiddlerToFile(tiddler, options, callback)
    }
  }

  FileSystemAdaptor.prototype.saveSystemTiddler = function (tiddler, options, callback) {
    const title = tiddler.fields.title
    const fileInfo = this.boot.files[title]
    if (fileInfo) {
      if (/system\.json$/.test(fileInfo.filepath)) {
        this.saveTiddlerToSystemJson('update', tiddler, callback)
      } else {
        this.saveTiddlerToFile(tiddler, options, callback)
      }
    } else {
      this.saveTiddlerToSystemJson('new', tiddler, callback)
    }
  }

  FileSystemAdaptor.prototype.saveTiddlerToSystemJson = function (op, tiddler, callback) {
    const filepath = path.resolve(this.boot.wikiTiddlersPath, 'system.json')
    const tiddlers = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf-8')) : []
    const fields = {}
    const exclude = ['creator', 'created', 'modifier', 'modified', '__new']
    for (const k in tiddler.fields) {
      if (!exclude.includes(k)) {
        fields[k] = tiddler.fields[k]
      }
    }

    if (op == 'new') {
      tiddlers.push(fields)
      delete tiddler.new
    } else {
      const index = tiddlers.findIndex(fields => fields.title === tiddler.fields.title)
      tiddlers[index] = fields
    }

    const content = '[' + tiddlers.map(v => JSON.stringify(v, null, 2)).join(', ') + ']'
    this.writeToFile(filepath, content, (err) => {
      callback(err, {
        filepath,
        hasMetaFile: false,
        type: fields.type
      })
    })
  }

  FileSystemAdaptor.prototype.writeToFile = function (filepath, content, callback) {
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

  FileSystemAdaptor.prototype.shouldSaveInCache = function (tiddler) {
    const titles = ['$:/StoryList', '$:/Import']
    return !!tiddler.fields['draft.of'] || titles.includes(tiddler.fields.title)
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
    const self = this
    const fileInfo = this.boot.files[title]
    // Only delete the tiddler if we have writable information for the file
    if (fileInfo) {
      $tw.utils.deleteTiddlerFile(fileInfo, function (err, fileInfo) {
        if (err) {
          if ((err.code === 'EPERM' || err.code === 'EACCES') && err.syscall === 'unlink') {
            // Error deleting the file on disk, should fail gracefully
            $tw.syncer.displayError('Server desynchronized. Error deleting file for deleted tiddler "' + title + '"', err)
            return callback(null, fileInfo)
          } else {
            return callback(err)
          }
        }
        // Remove the tiddler from self.boot.files & return null adaptorInfo
        self.removeTiddlerFileInfo(title)
        return callback(null, null)
      })
    } else {
      callback(null, null)
    }
  }

  /**
   * Delete a tiddler in cache, without modifying file system.
   */
  FileSystemAdaptor.prototype.removeTiddlerFileInfo = function (title) {
    // Only delete the tiddler info if we have writable information for the file
    if (this.boot.files[title]) {
      delete this.boot.files[title]
    };
  }

  if ($tw.node) {
    exports.adaptorClass = FileSystemAdaptor
  }
})()
