var fs = require("fs")
var path = require('path')
var parser = require("@babel/parser")
var babel = require("@babel/core")
var traverse = require("@babel/traverse").default
const moduleAnalyser = (fspath)=>{
    const content = fs.readFileSync(fspath,"utf-8")
    // fs只是获取了index.js里面的文件的代码字符串,字符串包括两部分一部分是运行的代码一部分是,一部分是引入import依赖
    //目前我们要做的就是吧我们引入的文件转换成抽象语法树，将那些是code文件，和引入文件抽离出来，这个里的ast 的type是 file类型
    const ast  = parser.parse(content,{sourceType:'module'})
    // console.log(ast)
    // 需要把里面的node转换一下
    // 如果src/index.js 里面有很多的import文件，ImportDeclaration会执行多次，这里的抽象语法树是ImportDeclaration类型，也就是import的内容
    const dependencies = {}
    const dirname = path.dirname(fspath)
    traverse(ast,{ImportDeclaration({node}){
        dependencies[node.source.value] = "./"+path.join(dirname,node.source.value)+".js"
    }})
    // 获取的code内容
    const {code} = babel.transformFromAst(ast,null,{
        presets:["@babel/preset-env"]
    })
    for(var i in dependencies){
        moduleAnalyser(dependencies[i])
    }
    return {
        code,
        dependencies,
        fspath
    }
}
const makeDependenciesGraph = (fspath)=>{
    const entryModule =  moduleAnalyser(fspath)
    const graphArray = [ entryModule ]
    // 这个地方不能使用forEach，在graphArray.foreach之后在push，foreach 不会在执行下面新加的内容
    for(var element =0;element<graphArray.length;element++){
        let { dependencies } = graphArray[element]
        for(var i  in dependencies){
            // 每次遍历都会给graphArray增加一个内容，增加长度，实现了递归
            graphArray.push(moduleAnalyser(dependencies[i]))
        }
    };
   let graphObj = {}
//    console.log(graphArray)
   graphArray.forEach(element=>{
    graphObj[element.fspath]={
        code:element.code,
        dependencies:element.dependencies,
    }
   })
   return graphObj
}
const generateCode = (entry)=>{
    const graph = JSON.stringify(makeDependenciesGraph(entry))
    // 要让每个code执行，但code里面有 require(入口文件) 和export ,为了不污染全集变量必须使用立即执行函数
    // 应为我们引入的文件都是是 ”./word“但是我们需要的./src/word.js 所以我们的重新require函数，在每一个import时候就会从小调用require函数，实现了递归到每一个引入文件
    return `
        (function (graph){
            function require(module){
                function localReqruire (realtive){
                    return require(graph[module].dependencies[realtive])
                }
                var exports = {}
                function abc (require,exports,code){
                    eval(code)
                    }
                abc(localReqruire,exports,graph[module].code)
                return exports
            }
            require('${entry}')
        })(${graph})
    `
}
console.log(generateCode("./src/index.js"))
