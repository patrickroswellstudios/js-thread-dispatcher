//Written by Patrick Phelan patrick+dispatcher@roswellstudio.com
var dispatcherFactory = function() {
	var nodes = {};//key to sub-nodes for which I am the central dispatch
	var localID = '';//key back the central dispatch for which I am a node
	var hasContext = false;
	var contextID = 0;//presumably, you would have an id for your sub-nodes
	var contexts = [];//or are storing this for your parent
	/**
	 * onmessage reponder function, takes the event name, finds the related function, calls it.
	 * @param {Event} e 
	 */
	var onmssfunc = function(e) {
		if (!e.data || !e.data.to) {
			return;
		}
		if (hasContext) {
			e.context = contextID;
		}
		var f = vtable[e.data.to];
		if (f && typeof f == "function") {
			f(dispatcher, e.data);
		} else {
			console.error('function not found: '+ e.data.to);
		}
	}
	/**
	 * Report the events you respond to back up to your parent
	 * @param {String} arr 
	 */
	function reportEvents(arr) {
		if (localID!='') {
			let farr = arr.filter((a)=>!a.startsWith('_'));
			if (farr.length) {
				postMessage({to:'_dResponder', reply:localID, data:farr});
			}
		}
	}
	/**
	 * Push the events you respond to downwards, either to 1 specific named node or all of them.
	 * 
	 * @param {String} name 
	 */
	function pushDiscovery(name = null) {
		//TODO: PUSH needs to go to every node in the cluster. ONly cluster function has that
		let events = Object.keys(vtable).filter((o)=>!o.startsWith('_'));
		if (name) {
			nodes[name](dispatcher, {to:'_pResponder', data: events}, true);
		} else {
			Object.keys(nodes).forEach((o)=>nodes[o](dispatcher, {to:'_pResponder', data: events}, true));
		}
	}
	var vtable = {
		'_dResponder':function(dispatcher, event){ 
			//create a vtable record back the source node for all the events listed
			if (event.reply && nodes[event.reply] && event.data) {
				event.data.forEach(function(name) {
					if (!vtable[name]) {//don't let children overwrite your own data elements.
						vtable[name] = nodes[event.reply];
					}
				})
			}
		},
		'_discovery':function(dispatcher, event) {
			localID = event.reply;
			reportEvents(Object.keys(vtable));
		},
		/** 
		 * parent responder: each event in data should be fired upwards.
		 */
		'_pResponder':function(dispatcher,event){
			event.data.forEach((o)=>{
				if (!vtable[o]) {
					vtable[o] = function(dispatcher, event){
						postMessage(event);
					}
				}
			})
		},
		'_createContext':function(dispatcher, event) {
			let count = contexts.length;
			contexts[count] = {};
			postMessage({to:'_ackContext', data: count});
		},
		'_destroyContext':function(dispatcher, event) {
			delete contexts[event.contextID];
		},
		'_ackContext':function(dispatcher, event) {
			contextID = event.reply;
		}
	};


	onmessage = onmssfunc;
	var dispatcher =  {
		ok: function(event) {},
		reject: function(event) {},
		respond: function(obj) {
			Object.assign(vtable, obj);
			reportEvents(Object.keys(obj));
			pushDiscovery();
		},
		requestContext: function(name){
			//assuming that this dispatcher only tracks one context.
			//like multiple thin clients to a server.
			if (nodes[name]) {
				nodes[name](this, {to:'_createContext'})
			}
		},
		getContext: function(event) {
			if (event.context && contexts[event.context]) {
				return contexts[event.context];
			}
			return contexts[event.context] = {};
		},
		event: function(to, data, reply=null) {
			onmssfunc({data:{to, reply, data}});
		},
		/**
		 * create a single local event responder with the given name.
		 * f should have 2 parameters, dispatch(this) and the event
		 * name is the event name it responds to.
		 */
		local: function(f, name) {
			//not sure why you'd want this, but here it is
			vtable[name] = f;
		},
		/**
		 * create a remote node at/via the url provided
		 * name is a drescriptive title. (see about autogenerating that)
		 */
		node: function(url, name) {
			let w = new Worker(url);
			w.onmessage = onmssfunc;
			w.postMessage({to:'_discovery',reply:name});
			var remote = function(dispatcher, event, broadcast) {
				w.postMessage(event);
			};
			nodes[name] = remote;
			pushDiscovery(name);
		},
		/**
		 * for an array of presumably similar node urls, create a load-balanced (round robin, at least) cluster of worker nodes
		 * They don't have to be identical, but do need to have the same events. (a/b testing?)
		 * name is a drescriptive title. (see about autogenerating that)
		 */
		cluster: function(discovery, name) {
			if (!discovery.length) {
				return;
			}
			var cluster_nodes = [];
			var current_node = 0;
			discovery.forEach(function(url, i){
				let w = new Worker(url);
				w.onmessage = onmssfunc;
				cluster_nodes.push(w);
			});
			var cluster = function(dispatcher, event, broadcast) {
				if (broadcast) {
					cluster_nodes.forEach((o)=>o.postMessage(event))
					return;
				}
				//pick a node, round-robin style
				//TODO: if there is an event.context, use the node associated with that context
				cluster_nodes[current_node].postMessage(event);
				current_node = (current_node + 1) % cluster_nodes.length;
				//this bit uses a closure to hold nodes. Without that, it would need another dispatch.clusters field, cluster lookup
			};
			nodes[name] = cluster;
			pushDiscovery(name);
			cluster_nodes[0].postMessage({to:'_discovery',reply:name});//assume all the nodes in the cluster respond to the same things. Would be confusing if they did not.
			//although, adding nodes to events like .on('event', node) would also be cool.
		}
	}
	return dispatcher;
}
