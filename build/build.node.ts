namespace $ {
	
	export class $mol_build extends $mol_object {
		
		@ $mol_mem_key()
		static root( path : string ) {
			return new this().setup(
				obj => {
					obj.root = ()=> $mol_file.absolute( path )
				}
			)
		}
		
		static relative( path : string ) {
			return $mol_build.root( $mol_file.relative( path ).path() )
		}
		
		@ $mol_mem()
		server() {
			return new $mol_build_server().setup(
				obj => {
					obj.build = $mol_const( this )
				}
			)
		}
		
		root() {
			return $mol_file.relative( '.' )
		}
		
		@ $mol_mem_key()
		mods( { path , exclude } : { path : string , exclude? : string[] } ) {
			return $mol_file.absolute( path ).childs()
			.filter(
				child => {
					var name = child.name()
					if( !/^[a-z]/.test( name ) ) return false
					if( exclude && RegExp( '[.=](' + exclude.join( '|' ) + ')[.]' , 'i' ).test( name ) ) return false
					
					return true
				}
			)
			// .sort( ( a , b )=> a.path().length - b.path().length )
		}
		
		@ $mol_mem_key()
		modsRecursive( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			var mod = $mol_file.absolute( path )
			switch( mod.type() ) {
				case 'file' :
					return [ mod ]
				case 'dir' :
					var mods = [ mod ]
					for( var m of this.mods( { path , exclude } ) ) {
						if( m.type() !== 'dir' ) continue
						for( var dep of this.modsRecursive( { path : m.path() , exclude } ) ) {
							if( mods.indexOf( dep ) !== -1 ) continue
							mods.push( dep )
						}
					}
					return mods
				case null :
					throw new Error( `Module not found: "${mod.relate()}"` )
			}
			throw new Error( `Unsopported type "${mod.type()}" of "${mod.relate()}"` )
		}
		
		@ $mol_mem_key()
		sources( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			var mod = $mol_file.absolute( path )
			switch( mod.type() ) {
				case 'file' :
					return [ mod ]
				case 'dir' :
					return this.mods( { path , exclude } ).filter( mod => mod.type() === 'file' )
				default:
					return []
			}
		}
		
		@ $mol_mem_key()
		sourcesSorted( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			const mod = $mol_file.absolute( path )
			const graph = new $mol_graph< void , { priority : number } >()
			const sources = this.sources( { path , exclude } )
			for( let src of sources ) {
				graph.nodeEnsure( src.relate( this.root() ) )
			}
			for( let src of sources ) {
				let deps = this.srcDeps( src.path() )
				for( let p in deps ) {
					
					var names : string[]
					if( p[ 0 ] === '/' ) names = p.substring( 1 ).split( '/' )
					else names = mod.resolve( p ).relate( this.root() ).split( '/' )
					
					let files = [ this.root() ]
					for( let name of names ) {
						let nextFiles : $mol_file[] = []
						for( let file of files ) {
							let validName = new RegExp( `^(${file.name()})?${name}(?![a-z0-9])` , 'i' )
							for( let child of this.mods( { path : file.path() , exclude } ) ) {
								if( !child.name().match( validName ) ) continue
								nextFiles.push( child )
							}
						}
						if( nextFiles.length === 0 ) break
						files = nextFiles
					}
					
					for( let file of files ) {
						if( file === this.root() ) continue
						
						if( file.relate( this.root() ) in graph.nodes ) {
							graph.link(
								src.relate( this.root() ) ,
								file.relate( this.root() ) ,
								{ priority : deps[ p ] }
							)
						}
					}
					
				}
			}
			
			let next = graph.sorted( edge => edge.priority ).map( name => this.root().resolve( name ) )
			return next
		}
		
		
		@ $mol_mem_key()
		sourcesAll( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			const sortedPaths = this.graph( { path , exclude } ).sorted( edge => edge.priority )
			
			let sources : $mol_file[] = []
			sortedPaths.forEach( path => {
				this.sourcesSorted( { path : this.root().resolve( path ).path() , exclude } ).forEach( src => {
					if( sources.indexOf( src ) === -1 ) sources.push( src )
				} )
			} )
			
			let sources2 : $mol_file[] = []
			sources.forEach(
				src => {
					if( !/(view\.tree)$/.test( src.ext() ) ) return sources2.push( src )
					
					var targetScript = src.parent().resolve( `-/view.tree/${src.name()}.ts` )
					var targetLocale = src.parent().resolve( `-/view.tree/${src.name()}.locale.json` )
					
					var tree = $mol_tree.fromString( String( src.content() ) , src.path() )
					var res = $mol_viewer_tree2ts( tree )
					targetScript.content( res.script )
					targetLocale.content( JSON.stringify( res.locales , null , '\t' ) )
					
					sources2.push( targetScript , targetLocale )
				}
			)
			
			return sources2
		}
		
		@ $mol_mem()
		tsHost() {
			
			var options = {
				experimentalDecorators : true ,
				noEmitOnError : false ,
				noImplicitAny : true ,
				target : $node.typescript.ScriptTarget.ES5 ,
				removeComments : true ,
				sourceMap : true ,
				inlineSources : true ,
				allowJS : true ,
			}
			
			var host = {
				// getScriptFileNames : () => [] ,
				getScriptVersion : ( path : string )=> $mol_file.absolute( path ).version() ,
				getScriptSnapshot : ( path : string )=> $mol_file.absolute( path ).content().toString() ,
				getCurrentDirectory : ()=> this.root().path() ,
				getCompilationSettings : ()=> options ,
				useCaseSensitiveFileNames : ()=> false ,
				getCanonicalFileName : ( path : string )=> path.toLowerCase() ,
				getDefaultLibFileName : ( options : any )=> $node.typescript.getDefaultLibFilePath( options ) ,
				getCommonSourceDirectory : ()=> this.root().path() ,
				getNewLine : ()=> '\n' ,
				getSourceFile : ( path : string , target : any , fail : any )=> {
					var content = $mol_file.absolute( path ).content().toString()
					return $node.typescript.createSourceFile( path , content , target )
				} ,
				fileExists : ( path : string )=> {
					return $mol_file.absolute( path ).exists()
				} ,
				writeFile : ( path : string , content : string )=> {
					$mol_file.absolute( path ).content( void 0 , content )
				} ,
			}
			
			return host
		}
		
		@ $mol_mem_key()
		sourcesJS( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			var sources = this.sourcesAll( { path , exclude } )
			.filter( src => /(js|tsx?|view\.tree)$/.test( src.ext() ) )
			if( !sources.length ) return []
			
			var sourcesTS : $mol_file[] = []
			sources = sources.map(
				src => {
					if( !/tsx?$/.test( src.ext() ) ) return src
					
					sourcesTS.push( src )
					return src.parent().resolve( src.name().replace( /\.tsx?$/ , '.js' ) )
				}
			)
			
			if( sourcesTS.length ) {
				
				var host = this.tsHost()
				var options = host.getCompilationSettings()
				
				var program = $node.typescript.createProgram( sourcesTS.map( src => src.path() ) , options , host )
				var result = program.emit()
				
				var errors : any[] = $node.typescript.getPreEmitDiagnostics( program ).concat( result.diagnostics )
				var logs = errors.map(
					error => {
						var message = $node.typescript.flattenDiagnosticMessageText( error.messageText , '\n' )
						if( !error.file ) return message
						
						var pos = error.file.getLineAndCharacterOfPosition( error.start )
						return error.file.fileName + ':' + (pos.line + 1) + ':' + pos.character + '\n ' + message
					}
				)
				if( logs.length ) throw new Error( '\n' + logs.join( '\n' ) )
				
			}
			
			return sources
		}
		
		@ $mol_mem_key()
		sourcesCSS( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			return this.sourcesAll( { path , exclude } ).filter( src => /(css)$/.test( src.ext() ) )
		}
		
		static dependors : { [ index : string ] : ( source : $mol_file )=> { [ index : string ] : number } } = {}
		
		@ $mol_mem_key()
		srcDeps( path : string ) {
			var src = $mol_file.absolute( path )
			var ext = src.ext()
			
			var dependencies : ( src : $mol_file ) => { [ path : string ] : number } = null
			while( !dependencies ) {
				dependencies = this.Class().dependors[ ext ]
				if( dependencies ) break
				var extShort = ext.replace( /^\w+\./ , '' )
				if( ext === extShort ) break
				ext = extShort
			}
			
			return dependencies ? dependencies( src ) : {}
		}
		
		@ $mol_mem_key()
		modDeps( { path , exclude } : { path : string , exclude? : string[] } ) {
			const mod = $mol_file.absolute( path )
			const depends : { [ index : string ] : number } = { '..' : 0 }
			for( var src of this.sources( { path , exclude } ) ) {
				$mol_build_depsMerge( depends , this.srcDeps( src.path() ) )
			}
			return depends
		}
		
		@ $mol_mem_key()
		dependencies( { path , exclude } : { path : string , exclude? : string[] } ) {
			var mod = $mol_file.absolute( path )
			switch( mod.type() ) {
				case 'file' :
					return this.srcDeps( path )
				case 'dir' :
					return this.modDeps( { path , exclude } )
			}
		}
		
		@ $mol_mem_key()
		packEnsure( name : string ) {
			var mapping = this.packMapping()
			
			var pack = this.root().resolve( name )
			if( pack.exists() ) {
				if( pack.resolve( '.git' ).exists() ) {
					try {
						$mol_exec( pack.path() , 'git' , '--no-pager' , 'fetch' )
						$mol_exec( pack.path() , 'git' , '--no-pager' , 'log' , '--oneline' , 'HEAD..origin/master' )
					} catch( error ) {
						console.error( error.message )
					}
				}
				return false
			}
			
			for( let repo of mapping.select( 'pack' , name , 'git' ).childs ) {
				$mol_exec( this.root().path() , 'git' , 'clone' , repo.value , name )
				pack.stat( void 0 )
				return true
			}
			
			throw new Error( `Package "${name}" not found` )
		}
		
		modEnsure( path : string ) {
			var file = $mol_file.absolute( path )
			var sub = file.relate( this.root() )
			var name = sub.replace( /\/.*$/ , '' )
			
			return this.packEnsure( name )
		}
		
		@ $mol_mem()
		packMapping() {
			return $mol_tree.fromString( $mol_file.relative( '.pms.tree' ).content() )
		}
		
		@ $mol_mem_key()
		graph( { path , exclude } : { path : string , exclude? : string[] } ) {
			let graph = new $mol_graph< {} , { priority : number } >()
			let added : { [ path : string ] : boolean } = {}
			
			var addMod = ( mod : $mol_file )=> {
				if( added[ mod.path() ] ) return
				added[ mod.path() ] = true
				
				graph.nodes[ mod.relate( this.root() ) ] = null
				
				let deps = this.dependencies( { path : mod.path() , exclude } )
				for( let p in deps ) {
					
					var dep = ( p[ 0 ] === '/' ) ? this.root().resolve( p ) : mod.resolve( p )
					this.modEnsure( dep.path() )
					
					while( !dep.exists() ) dep = dep.parent()
					//if( dep.type() === 'file' ) dep = dep.parent()
					if( mod === dep ) continue
					if( dep === this.root() ) continue
					
					graph.link( mod.relate( this.root() ) , dep.relate( this.root() ) , { priority : deps[ p ] } )
					
					addMod( dep )
				}
			}
			
			this.modEnsure( path )
			this.modsRecursive( { path , exclude } ).forEach( mod => addMod( mod ) )
			
			return graph
		}
		
		@ $mol_mem_key()
		bundle( { path , bundle } : { path : string , bundle? : string } ) {
			
			bundle = bundle && bundle.replace( /\.map$/ , '' )
			
			var envsDef = [ 'web' , 'node' ]
			var envs = envsDef.slice()
			var stages = [ 'test' , 'dev' ]
			
			if( bundle ) {
				var [ bundle , tags , type , locale ] = /^(.*?)(?:\.(test\.js|js|css|deps\.json|locale(?:=(.*))?\.json))?$/.exec(
					bundle
				)
				
				tags.split( '.' ).forEach(
					tag => {
						if( envs.indexOf( tag ) !== -1 ) envs = [ tag ]
					}
				)
			}
			
			var res : $mol_file[] = []
			
			envs.forEach(
				env => {
					var exclude = envsDef.filter( e => e !== env ).concat( stages )
					
					if( !type || type === 'deps.json' ) {
						res = res.concat( this.bundleDepsJSON( { path , exclude , bundle : env } ) )
					}
					if( !type || type === 'css' ) {
						res = res.concat( this.bundleCSS( { path , exclude , bundle : env } ) )
					}
					if( !type || type === 'js' ) {
						res = res.concat( this.bundleJS( { path , exclude , bundle : env } ) )
					}
					if( !type || type === 'test.js' ) {
						res = res.concat( this.bundleTestJS( { path , exclude , bundle : env } ) )
					}
					if( !type || /^locale(?:=.*)?.json$/.test( type ) ) {
						res = res.concat(
							this.bundleLocale(
								{
									path ,
									exclude ,
									bundle : env ,
									locale : type ? locale : 'en'
								}
							)
						)
					}
					if( env === 'node' && ( !bundle || bundle === 'package.json' ) ) {
						res = res.concat( this.bundlePackageJSON( { path , exclude } ) )
					}
				}
			)
			
			return res
		}
		
		logBundle( target : $mol_file ) {
			var time = new Date().toLocaleTimeString()
			var path = target.relate( this.root() )
			console.log( `${time} Builded ${path}` )
		}
		
		@ $mol_mem_key()
		bundleJS( { path , exclude , bundle } : { path : string , exclude? : string[] , bundle : string } ) : $mol_file[] {
			var pack = $mol_file.absolute( path )
			
			var target = pack.resolve( `-/${bundle}.js` )
			var targetMap = pack.resolve( `-/${bundle}.js.map` )
			
			var sources = this.sourcesJS( { path , exclude } )
			if( sources.length === 0 ) return []
			
			var concater = new $node[ 'concat-with-sourcemaps' ]( true , target.name() , '\n;\n' )
			if( bundle === 'node' ) {
				concater.add( '' , 'require( "source-map-support" ).install(); var exports = void 0;\n' )
			}
			
			sources.forEach(
				function( src ) {
					var content = src.content().toString().replace( /^\/\/#\ssourceMappingURL=/mg , '//' )
					
					var srcMap = src.parent().resolve( src.name() + '.map' ).content()
					if( srcMap ) {
						var map = JSON.parse( srcMap )
						map.sourceRoot = src.parent().relate( target.parent() )
					}
					
					concater.add( src.relate( target.parent() ) , content , map && JSON.stringify( map ) )
				}
			)
			
			target.content( concater.content + '\n//# sourceMappingURL=' + targetMap.relate( target.parent() ) )
			targetMap.content( concater.sourceMap )
			
			this.logBundle( target )
			
			return [ target , targetMap ]
		}
		
		@ $mol_mem_key()
		bundleTestJS( { path , exclude , bundle } : { path : string , exclude? : string[] , bundle : string } ) : $mol_file[] {
			var pack = $mol_file.absolute( path )
			
			var target = pack.resolve( `-/${bundle}.test.js` )
			var targetMap = pack.resolve( `-/${bundle}.test.js.map` )
			
			var concater = new $node[ 'concat-with-sourcemaps' ]( true , target.name() , '\n;\n' )
			
			var sources = this.sourcesJS( { path , exclude : exclude.filter( ex => ex !== 'test' && ex !== 'dev' ) } )
			if( bundle === 'node' ) {
				concater.add( '' , 'require( "source-map-support" ).install()\n' )
			} else {
				var sourcesNoTest = this.sourcesJS( { path , exclude } )
				sources = sources.filter( src => sourcesNoTest.indexOf( src ) === -1 )
			}
			if( sources.length === 0 ) return []
			
			sources.forEach(
				function( src ) {
					var content = src.content().toString().replace( /^\/\/#\ssourceMappingURL=/mg , '//' )
					
					var srcMap = src.parent().resolve( src.name() + '.map' ).content()
					if( srcMap ) {
						var map = JSON.parse( srcMap )
						map.sourceRoot = src.parent().relate( target.parent() )
					}
					
					concater.add( src.relate( target.parent() ) , content , map && JSON.stringify( map ) )
				}
			)
			
			target.content( concater.content + '\n//# sourceMappingURL=' + targetMap.relate( target.parent() ) )
			targetMap.content( concater.sourceMap )
			
			this.logBundle( target )
			
			return [ target , targetMap ]
		}
		
		@ $mol_mem_key()
		bundlePackageJSON( { path , exclude } : { path : string , exclude? : string[] } ) : $mol_file[] {
			var pack = $mol_file.absolute( path )
			
			var target = pack.resolve( `-/package.json` )
			var targetMap = pack.resolve( `-/package.json` )
			
			var sources = this.sourcesAll( { path , exclude : exclude.filter( ex => ex !== 'test' && ex !== 'dev' ) } )
			
			var json = {
				name : pack.relate( this.root() ).replace( /\//g , '_' ) ,
				version : '0.0.0' ,
				main : 'node.js' ,
				dependencies : <{ [ key : string ] : string }>{}
			}
			
			for( let src of sources ) {
				let deps = this.srcDeps( src.path() )
				for( let dep in deps ) {
					if( !/^\/node\//.test( dep ) ) continue
					let mod = dep.replace( /^\/node\// , '' ).replace( /\/.*/g , '' )
					json.dependencies[ mod ] = '*'
				}
			}
			
			target.content( JSON.stringify( json , null , '  ' ) )
			
			this.logBundle( target )
			
			return [ target ]
		}
		
		@ $mol_mem_key()
		bundleCSS( { path , exclude , bundle } : { path : string , exclude? : string[] , bundle : string } ) : $mol_file[] {
			var pack = $mol_file.absolute( path )
			var sources = this.sourcesCSS( { path , exclude } )
			if( !sources.length ) return []
			
			var target = pack.resolve( `-/${bundle}.css` )
			var targetMap = pack.resolve( `-/${bundle}.css.map` )
			
			var root : any = null //$node.postcss.root({})
			sources.forEach(
				src => {
					var root2 = $node.postcss.parse( src.content() , { from : src.path() } )
					root = root ? root.append( root2 ) : root2
				}
			)
			
			var cssnext = $node[ 'postcss-cssnext' ]
			var processor = $node.postcss(
				cssnext(
					null , {
						features : {
							customProperties : {
								preserve : true
							}
						}
					}
				).plugins
			)
			var result = processor.process( root , { to : target.relate() , map : { inline : false } } )
			
			target.content( result.css )
			targetMap.content( JSON.stringify( result.map , null , '\t' ) )
			
			this.logBundle( target )
			
			return [ target , targetMap ]
		}
		
		@ $mol_mem_key()
		bundleLocale( { path , exclude , bundle , locale } : { path : string , exclude? : string[] , bundle : string , locale : string } ) : $mol_file[] {
			const pack = $mol_file.absolute( path )
			
			const sources = this.sourcesAll( { path , exclude } ).filter( src => /(locale\.json)$/.test( src.ext() ) )
			if( !sources.length ) return []
			
			const locales : { [ key : string ] : string } = {}
			
			sources.forEach(
				src => {
					const loc = JSON.parse( src.content() )
					for( let key in loc ) locales[ key ] = loc[ key ]
				}
			)
			
			const ext = locale ? `locale=${ locale }.json` : `locale.json`
			const target = pack.resolve( `-/${bundle}.${ ext }` )
			target.content( JSON.stringify( locales , null , '\t' ) )
			
			this.logBundle( target )
			
			return [ target ]
		}
		
		@ $mol_mem_key()
		bundleDepsJSON( { path , exclude , bundle } : { path : string , exclude? : string[] , bundle : string } ) : $mol_file[] {
			var pack = $mol_file.absolute( path )
			
			var list = this.sourcesAll( { path , exclude } )
			if( !list.length ) return []
			
			var graph = this.graph( { path , exclude } )
			
			var deps : any = {}
			for( let dep in graph.nodes ) {
				deps[ dep ] = this.dependencies( { path : this.root().resolve( dep ).path() , exclude } )
			}
			
			var data = {
				files : list.map( src => src.relate( this.root() ) ) ,
				edgesIn : graph.edgesIn ,
				edgesOut : graph.edgesOut ,
				deps
			}
			
			var target = pack.resolve( `-/${bundle}.deps.json` )
			target.content( JSON.stringify( data ) )
			
			this.logBundle( target )
			
			return [ target ]
		}
	}
	
	function $mol_build_depsMerge(
		target : { [ index : string ] : number } ,
		source : { [ index : string ] : number }
	) : { [ index : string ] : number } {
		for( var path in source ) {
			if( target[ path ] >= source[ path ] ) continue
			target[ path ] = source[ path ]
		}
		return target
	}
	
	$mol_build.dependors[ 'ts' ] = $mol_build.dependors[ 'tsx' ] = $mol_build.dependors[ 'jam.js' ] = source => {
		var depends : { [ index : string ] : number } = {}
		
		var lines = String( source.content() )
		.replace( /\/\*[^]*?\*\//g , '' ) // drop block comments
		.replace( /\/\/.*$/gm , '' ) // drop inline comments
		.split( '\n' )
		
		lines.forEach(
			function( line ) {
				var indent = /^([\s\t]*)/.exec( line )
				var priority = -indent[ 0 ].replace( /\t/g , '    ' ).length / 4
				
				line.replace(
					/\$([a-z][a-z0-9]+(?:[._][a-z0-9]+)*)/ig , ( str , name )=> {
						$mol_build_depsMerge( depends , { [ '/' + name.replace( /[._-]/g , '/' ) ] : priority } )
						return str
					}
				)
				
				line.replace(
					/require\(\s*['"](.*?)['"]\s*\)/ig , ( str , path )=> {
						$mol_build_depsMerge( depends , { [ path ] : priority } )
						return str
					}
				)
			}
		)
		
		return depends
	}
	
	$mol_build.dependors[ 'view.ts' ] = source => {
		var treeName = source.name().replace( /ts$/ , 'tree' )
		var depends : { [ index : string ] : number } = { [ treeName ] : 0 }
		$mol_build_depsMerge( depends , $mol_build.dependors[ 'ts' ]( source ) )
		return depends
	}
	
	$mol_build.dependors[ 'css' ] = $mol_build.dependors[ 'view.css' ] = source => {
		var depends : { [ index : string ] : number } = {}
		
		var lines = String( source.content() )
		.replace( /\/\*[^]*?\*\//g , '' ) // drop block comments
		.replace( /\/\/.*$/gm , '' ) // drop inline comments
		.split( '\n' )
		
		lines.forEach(
			function( line ) {
				var indent = /^([\s\t]*)/.exec( line )
				var priority = -indent[ 0 ].replace( /\t/g , '    ' ).length / 4
				
				line.replace(
					/(?:--|[\[\.#])([a-z][a-z0-9]+(?:[-_][a-z0-9]+)+)/ig , ( str , name )=> {
						$mol_build_depsMerge( depends , { [ '/' + name.replace( /[._-]/g , '/' ) ] : priority } )
						return str
					}
				)
			}
		)
		
		return depends
	}
	
	$mol_build.dependors[ 'view.tree' ] = source => {
		var depends : { [ index : string ] : number } = { '/mol/merge/dict' : 3 }
		
		var lines = String( source.content() )
		.split( '\n' )
		
		lines.forEach(
			function( line ) {
				var indent = /^([\s\t]*)/.exec( line )
				var priority = -indent[ 0 ].replace( /\t/g , '    ' ).length / 4
				
				line.replace(
					/\$([a-z][a-z0-9]+(?:[-_][a-z0-9]+)*)/ig , ( str , name )=> {
						$mol_build_depsMerge( depends , { [ '/' + name.replace( /[._-]/g , '/' ) ] : priority } )
						return str
					}
				)
			}
		)
		
		return depends
	}
	
}
