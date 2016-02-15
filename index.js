var rename = require("gulp-rename");
var fs = require('fs');
var es = require('event-stream');
var del = require('del');
var path = require('path');
var Q = require('q');
var _ = require('underscore');
var merge = require('merge');
var jsonnetExec = require('jsonnet-exec');
var util = require('gulp-template-util');

var gulp = null;

var info = {
    scriptFilenameExtension : "js",
    cssFilenameExtension : "css",
    htmlFilenameExtension : "html",
    gulpTemplateDir : "gulp_template",
    nodeModulesDir : "node_modules",
    i18nDir : "src/main/i18n",
    scriptDir : "src/main/webapp/js",
    cssDir : "src/main/webapp/css",
    viewsDir : "src/main/webapp/WEB-INF/view",
    javaI18nDir : "src/main/resources/i18n",
    webLibDir : "src/main/webapp/lib",
    webResourceDir : "src/main/webapp/resource",
    distDir : "src/main/webapp/dist",
    versionFile : "src/main/resources/version.properties",
    cdnFile : "src/main/resources/cdn.properties",
    jsWebI18n : "jsWebI18n",
    javaI18nFileName : "messages_#{file}.properties",
};

var version = '';
var cdn = '';

function addModuleTask(module, template){
    if(!template){
        template = 'default';
    }
    module = module.trim();
    var layerNum = util.countPathLayer(module);
    var scriptStream = gulp.src(util.dirPath(info.gulpTemplateDir) + template + '/script.' + info.scriptFilenameExtension)
        .pipe(rename(module + '.' + info.scriptFilenameExtension))
        .pipe(util.replaceEnv(layerNum))
        .pipe(gulp.dest(util.dirPath(info.scriptDir)));
    var cssStream = gulp.src(util.dirPath(info.gulpTemplateDir) + template + '/css.' + info.cssFilenameExtension)
        .pipe(rename(module + '.' + info.cssFilenameExtension))
        .pipe(util.replaceEnv(layerNum))
        .pipe(gulp.dest(util.dirPath(info.cssDir)));
    return util.streamsPromise(scriptStream, cssStream);
}

function addViewTask(view, template){
    if(!template){
        template = 'default';
    }
    view = view.trim();
    var layerNum = util.countPathLayer(view);
    var viewStream = gulp.src(util.dirPath(info.gulpTemplateDir) + template + '/html.' + info.htmlFilenameExtension)
        .pipe(rename(view + '.' + info.htmlFilenameExtension))
        .pipe(util.replaceEnv(layerNum))
        .pipe(gulp.dest(util.dirPath(info.viewsDir)));
    return Q.all([util.streamsPromise(viewStream), addModuleTask(view)]);
}

function delModuleTask(module){
    module = util.filePath(module.trim());
    return del([
        util.dirPath(info.scriptDir) + module + '.' + info.scriptFilenameExtension,
        util.dirPath(info.cssDir) + module + '.' + info.cssFilenameExtension
    ]);
}

function delViewTask(view){
    view = util.filePath(view.trim());
    return Q.all([del([util.dirPath(info.viewsDir) + view + '.' + info.htmlFilenameExtension]), delModuleTask(view)]);
}

function cleanTask(){
    return del([
        info.distDir,
        info.javaI18nDir
    ]);
}

function copyWebLibTask(){
    var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8').toString());
    if(!packageJson.dependencies){
        packageJson.dependencies = {};
    }
    var webLibModules = [];
    for(var module in packageJson.dependencies){
        webLibModules.push(util.dirPath(info.nodeModulesDir) + module + '/**/*');
    }
    return gulp.src(webLibModules, {base : util.dirPath(info.nodeModulesDir)})
        .pipe(gulp.dest(util.dirPath(info.distDirWithVersion)))
        .pipe(gulp.dest(util.dirPath(info.webLibDir)));
}

function copyWebResourceTask(){
    return gulp.src(util.dirPath(info.webResourceDir) + "**/*", {base : util.dirPath(info.webResourceDir)})
        .pipe(gulp.dest(util.dirPath(info.distDirWithVersion)));
}

function jsonToProperties(json, prefix){
    var str = '';
    for(var p in json){
        if(typeof json[p] === 'object' && json[p] !== null){
            if(Array.isArray(json[p])){
                var arr = json[p];
                for(var i=0 ; i<arr.length ; i++){
                    if(typeof arr[i] === 'object' && arr[i] !== null){
                        str += jsonToProperties(arr[i], prefix+p+'.'+i+'.');
                    }else{
                        str += prefix+p+'.'+i+'='+arr[i]+"\n";
                    }
                }
            }else{
                str += jsonToProperties(json[p], prefix+p+'.');
            }
        }else{
            str += prefix+p+'='+json[p]+"\n";
        }
    }
    return str;
}

function buildJavaI18n(){
    return es.map(function(file, cb){
        var i18nJson = JSON.parse(file.contents.toString());
        var resutl = jsonToProperties(i18nJson, '');
        file.contents = new Buffer(resutl);
        var fileName = path.basename(file.path, '.jsonnet');
        file.path = path.join(file.base, info.javaI18nFileName.replace(/#{file}/g, fileName));
        cb(null, file);
    });
}

function buildJsI18n(){
    return es.map(function(file, cb){
        var i18nJson = JSON.parse(file.contents.toString());
        file.contents = new Buffer(info.jsWebI18n + ' = ' + JSON.stringify(i18nJson)+";");
        cb(null, file);
    });
}

function buildI18n(){
    return es.map(function(file, cb){
        var result = jsonnetExec.execSync(file.path);
        file.contents = new Buffer(result);
        cb(null, file);
    });
}

function i18nTask(paths){
    var javaI18nStream = gulp.src(util.splitPaths(paths))
        .pipe(buildI18n())
        .pipe(buildJavaI18n())
        .pipe(rename({extname:'.properties'}))
        .pipe(gulp.dest(util.dirPath(info.javaI18nDir)));
    var jsI18nStream = gulp.src(util.splitPaths(paths))
        .pipe(buildI18n())
        .pipe(buildJsI18n())
        .pipe(rename({extname:'.js'}))
        .pipe(gulp.dest(util.dirPath(info.distI18n)));
    return util.streamsPromise(javaI18nStream, jsI18nStream);
}

function i18nAllTask(){
    return i18nTask(util.dirPath(info.i18nDir) + "**/*.jsonnet");
}


/* override */
function createScriptEnvContent(version, cdn){
    return 'var env = {version:"' + version + '",cdn:"' + cdn + '"};';
}

function scriptEnvTask(){
    return Q.nfcall(
        fs.writeFile,
        util.dirPath(info.scriptDir) + '_env.' + info.scriptFilenameExtension,
        gulpTemplateServletExpansion.createScriptEnvContent(info.version, '/' + util.filePath(util.dirPath(info.cdn) + info.version)));
}

/* override */
function buildScript(){
    return es.map(function(file, cb){
        setTimeout(function(){cb(null, file)}, 100);
    });
}

function scriptTask(paths){
    return gulp.src(util.splitPaths(paths))
        .pipe(gulpTemplateServletExpansion.buildScript())
        .pipe(rename({extname:'.js'}))
        .pipe(gulp.dest(util.dirPath(info.distJs)));
}

function scriptAllTask(){
    return scriptTask(util.dirPath(info.scriptDir) + '**/*.' + info.scriptFilenameExtension);
}


/* override */
function createCssEnvContent(version, cdn){
    return'env{version:"' + version + '";cdn:"' + cdn + '"}';
}

function cssEnvTask(){
    return Q.nfcall(
        fs.writeFile,
        util.dirPath(info.cssDir) + '_env.' + info.cssFilenameExtension,
        gulpTemplateServletExpansion.createCssEnvContent(info.version, '/' + util.filePath(util.dirPath(info.cdn) + info.version)));
}

/* override */
function buildCss(){
    return es.map(function(file, cb){
       setTimeout(function(){cb(null, file)}, 100); 
    });
}

function cssTask(paths){
    return gulp.src(util.splitPaths(paths))
        .pipe(gulpTemplateServletExpansion.buildCss())
        .pipe(rename({extname:'.css'}))
        .pipe(gulp.dest(util.dirPath(info.distCss)));
}

function cssAllTask(){
    return cssTask(util.dirPath(info.cssDir) + '**/*.' + info.cssFilenameExtension);
}


function buildTask(){
    var deferred = Q.defer();
    Q.fcall(gulpTemplateServletExpansion.cleanTask)
        .then(function(){return util.streamsPromise(gulpTemplateServletExpansion.copyWebLibTask(), gulpTemplateServletExpansion.copyWebResourceTask())})
        .then(function(){return Q.all([gulpTemplateServletExpansion.i18nAllTask(), gulpTemplateServletExpansion.scriptEnvTask(), gulpTemplateServletExpansion.cssEnvTask()])})
        .then(function(){return util.streamsPromise(gulpTemplateServletExpansion.scriptAllTask(), gulpTemplateServletExpansion.cssAllTask())})
        .then(function(){deferred.resolve();});
    return deferred.promise;
}


function gulpTemplateServletExpansion(gulpInstance, infos){
    gulp = gulpInstance;

    info = merge.recursive(info, infos);

    version = fs.readFileSync(info.versionFile, 'utf8').toString().match(/^version=(\S+)/m)[1];
    cdn = fs.readFileSync(info.cdnFile, 'utf8').toString().match(/^cdn=(.*)$/m)[1];

    info.version = version;
    info.cdn = cdn;
    info.distDirWithVersion = util.dirPath(info.distDir) + version;
    info.distJs = info.distDirWithVersion + '/js';
    info.distCss = info.distDirWithVersion + '/css';
    info.distI18n = info.distDirWithVersion + '/i18n';

	gulp.task('addModule', addModuleTask);
    gulp.task('addView', addViewTask);
    gulp.task('delModule', delModuleTask);
    gulp.task('delView', delViewTask);
    gulp.task('clean', cleanTask);
    gulp.task('copyWebLib', copyWebLibTask);
    gulp.task('copyWebResource', copyWebResourceTask);
    gulp.task('i18n', i18nTask);
    gulp.task("i18nAll", i18nAllTask);

    gulp.task('scriptEnv', scriptEnvTask);
    gulp.task('script', ['scriptEnv'], scriptTask);
    gulp.task('scriptAll', ['scriptEnv'], scriptAllTask);

    gulp.task('cssEnv', cssEnvTask);
    gulp.task('css', ['cssEnv'], cssTask);
    gulp.task('cssAll', ['cssEnv'], cssAllTask);

    gulp.task('build', buildTask);

    gulp.task('watch', function(view, modules){
        scriptModules = (!modules) ? [] : util.splitPaths(modules);
        scriptModules.push(view);
        var scriptPaths = _.map(scriptModules, function(name){return util.dirPath(info.scriptDir) + '**/' + name + '.' + info.scriptFilenameExtension});
        gulp.watch(scriptPaths, function(event){
            util.logStream(gulpTemplateServletExpansion.scriptTask, [util.dirPath(info.scriptDir) + '**/' + view + '.' + info.scriptFilenameExtension]);
        });

        cssModules = (!modules) ? [] : util.splitPaths(modules);
        cssModules.push(view);
        var cssPaths = _.map(cssModules, function(name){return util.dirPath(info.cssDir) + '**/' + name + '.' + info.cssFilenameExtension});
        gulp.watch(cssPaths, function(event){
            util.logStream(gulpTemplateServletExpansion.cssTask, [util.dirPath(info.cssDir) + '**/' + view + '.' + info.cssFilenameExtension]);
        });

        gulp.watch(util.dirPath(info.i18nDir) + "**/*.jsonnet", function(event){
            util.logPromise(gulpTemplateServletExpansion.i18nTask, [event.path]);
        });
    });

    gulpTemplateServletExpansion.version = version;
    gulpTemplateServletExpansion.cdn = cdn;
    gulpTemplateServletExpansion.info = info;

    return gulp;
}

gulpTemplateServletExpansion.addModuleTask = addModuleTask;
gulpTemplateServletExpansion.addViewTask = addViewTask;
gulpTemplateServletExpansion.delModuleTask = delModuleTask;
gulpTemplateServletExpansion.delViewTask = delViewTask;
gulpTemplateServletExpansion.cleanTask = cleanTask;
gulpTemplateServletExpansion.copyWebLibTask = copyWebLibTask;
gulpTemplateServletExpansion.copyWebResourceTask = copyWebResourceTask;
gulpTemplateServletExpansion.i18nTask = i18nTask;
gulpTemplateServletExpansion.i18nAllTask = i18nAllTask;
gulpTemplateServletExpansion.scriptEnvTask = scriptEnvTask;
gulpTemplateServletExpansion.scriptTask = scriptTask;
gulpTemplateServletExpansion.scriptAllTask = scriptAllTask;
gulpTemplateServletExpansion.cssEnvTask = cssEnvTask;
gulpTemplateServletExpansion.cssTask = cssTask;
gulpTemplateServletExpansion.cssAllTask = cssAllTask;
gulpTemplateServletExpansion.buildTask = buildTask;

gulpTemplateServletExpansion.createScriptEnvContent = createScriptEnvContent;
gulpTemplateServletExpansion.buildScript = buildScript;
gulpTemplateServletExpansion.createCssEnvContent = createCssEnvContent;
gulpTemplateServletExpansion.buildCss = buildCss;


if(typeof(window) != 'undefined' && window != null){
    window['gulpTemplateServletExpansion'] = gulpTemplateServletExpansion;
}

if(typeof(module) != 'undefined' && module != null){
    module.exports = gulpTemplateServletExpansion;    
}