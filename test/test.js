var assert = require('assert');
var gulp = require('gulp-param')(require('gulp'), process.argv);
var expansion = require('../index');

expansion(gulp, {versionFile:'test/version.properties', cdnFile:'test/cdn.properties'});

describe('gulp-template-servlet-expansion', function(){
    it('has expansion task', function(){
        assert(expansion.addModuleTask != null);
        assert(expansion.addViewTask != null);
        assert(expansion.delModuleTask != null);
        assert(expansion.delViewTask != null);
        assert(expansion.changeConfigTask != null);
        assert(expansion.cleanTask != null);
        assert(expansion.copyWebLibTask != null);
        assert(expansion.copyWebResourceTask != null);
        assert(expansion.i18nTask != null);
        assert(expansion.i18nAllTask != null);
        assert(expansion.scriptEnvTask != null);
        assert(expansion.scriptTask != null);
        assert(expansion.scriptAllTask != null);
        assert(expansion.cssEnvTask != null);
        assert(expansion.cssTask != null);
        assert(expansion.cssAllTask != null);
        assert(expansion.buildTask != null);
        assert(expansion.createScriptEnvContent != null);
        assert(expansion.buildScript != null);
        assert(expansion.createCssEnvContent != null);
        assert(expansion.buildCss != null);
        assert(expansion.version != null);
        assert.equal(expansion.version,'1.0.0');
        assert(expansion.cdn != null);
        assert.equal(expansion.cdn, '/dist');
        assert(expansion.info != null);
    });
});