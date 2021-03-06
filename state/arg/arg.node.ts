declare var process : any

namespace $ {

	export class $mol_state_arg< Value > extends $mol_object {
		
		@ $mol_mem()
		static href( next? : string ) : string {
			return next || process.argv.slice( 2 ).join( ' ' )
		}
		
		@ $mol_mem()
		static dict( next? : { [ key : string ] : string } ) {
			if( next !== void 0 ) this.href( this.make( next ) )
			
			var href = this.href()
			var chunks = href.split( /[\/\?#!&; ]/g )
			
			var params : { [ key : string ] : any } = {}
			chunks.forEach(
				chunk => {
					if( !chunk ) return
					var vals = chunk.split( /[:=]/ ).map( decodeURIComponent )
					params[ vals.shift() ] = vals
				}
			)
			
			return params
		}
		
		@ $mol_mem_key()
		static value( key : string , next? : string , prev? : string ) {
			if( next === void 0 ) return this.dict()[ key ] || null
			this.href( this.link( { [ key ] : next } ) )
			return next
		}
		
		static link( next : any ) {
			var params : { [ key : string ] : any } = {}
			
			var prev = this.dict()
			for( var key in prev ) {
				params[ key ] = prev[ key ]
			}
			
			for( var key in next ) {
				params[ key ] = next[ key ]
			}
			
			return this.make( params )
		}
		
		static make( next : { [ key : string ] : any } ) {
			var chunks : string[] = []
			for( var key in next ) {
				if( null == next[ key ] ) continue
				chunks.push( [ key ].concat( next[ key ] ).map( encodeURIComponent ).join( '=' ) )
			}
			
			return '#' + chunks.join( '#' )
		}
		
		constructor( public prefix = '' ) {
			super()
		}
		
		value( key : string , next? : string , prev? : string ) {
			return $mol_state_arg.value( this.prefix + key , next )
		}
		
		sub( postfix : string ) {
			return new $mol_state_arg( this.prefix + postfix + '.' )
		}
		
		link( next : { [ key : string ] : string } ) {
			var prefix = this.prefix
			var dict : { [ key : string ] : any } = {}
			for( var key in next ) {
				dict[ prefix + key ] = next[ key ]
			}
			return $mol_state_arg.link( dict )
		}
		
	}
	
}
