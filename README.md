# Javascript Thread dispatcher

A (mostly) painless way to take a JS object and launch it in a worker thread. It would still have all the limitations of worker threads, but it is easier than directly responding to arbitrary complex postMessages.

You would want to see [Threads considered as a helix of semi-precious nodes](http://c.dev.roswellstudios.com/threadx.html) to see it in action with examples.

It offers an easy async RPC, removing nested then()s or awaits. Each object's function can be more easily unit tested, and treated is as if it were not in a concurrent environment.

## Example

include dispatcher.js, then

```javascript
let dispatcher = dispatcherFactory();
my_ui_app = {
	'reply':function(dispatcher, event) {
	}
}

dispatcher.respond(my_ui_app);
dispatcher.node('d1node.js');
```

where d1node.js is

```javascript
importScripts('dispatcher.js');

let hello_app = {
	hello: function(dispatcher, event) {
	}
}

let dispatcher = dispatcherFactory();
dispatcher.respond(hello_app);
```

Both dispatchers will respond to `dispatcher.event('hello', 'message', 'reply');` by calling the function on the correct object in the correct thread. (where 'hello' is the function, 'message' is whatever data you want to send, and 'reply' is the callback function name. Not a callback function, because it has to go through the dispatch system again on the way back.)



