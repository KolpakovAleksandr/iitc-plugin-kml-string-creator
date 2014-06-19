// ==UserScript==
// @id             io.iago.stock-intel
// @namespace      http://www.iago.io/
// @name           IAGO for stock Intel Map
// @version        0.5.0
// @updateURL      https://iago-map.appspot.com/js/intel.iago.meta.js
// @downloadURL    https://iago-map.appspot.com/js/intel.iago.user.js
// @description    Adds IAGO support to standard Intel
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

var injectJS = function(fn) {
    var script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.textContent = '(' + fn + ')();';
    document.body.appendChild(script); // run the script
    document.body.removeChild(script); // clean up
};

var initMain = function() {
	console.log("IAGO loading... please stand by");
	// inject JS in the global scope
	injectJS(function() {
		// custom code here

		var addHTMLByElementId = function(htmlStr, elementId, where) {
			var elem;
			elem = document.getElementById(elementId);
			if (!elem) {
				console.log("Could not find element with ID: " + elementId);
				return;
			}
			if (!where) where = 'beforeend';
			elem.insertAdjacentHTML(where, htmlStr);
		};

		var addGlobalStyles = function(styleDefs) {
			var head, styleElem;
			head = document.getElementsByTagName('head')[0];
			if (!head) { return; }
			styleElem = document.createElement('style');
			styleElem.type = 'text/css';
			styleElem.textContent = styleDefs;
			head.appendChild(styleElem);
		};

		var UserMarker = function(map, position, locrecord) {
			this.map_ = map;
			this.position_ = position;
			this.locrecord_ = locrecord;
			this.moment_ = moment(locrecord.recorded_ms);
			this.div_ = null;
			this.setMap(map);
		};
		UserMarker.prototype = new google.maps.OverlayView();
		UserMarker.prototype.onAdd = function() {
			var div = document.createElement('div');
			div.className = 'iago-marker';
			var div2 = document.createElement('div');
			div2.className = 'plugin-iago-player';
			// add role-specific classes
			if (this.locrecord_.membership.is_peon) {
				div2.className += ' plugin-iago-peon';
			}
			if (this.locrecord_.membership.is_lone_wolf) {
				div2.className += ' plugin-iago-lone-wolf';
			}
			if (this.locrecord_.membership.is_captain) {
				div2.className += ' plugin-iago-captain';
			}
			if (this.locrecord_.membership.is_intel) {
				div2.className += ' plugin-iago-intel';
			}
			if (this.locrecord_.membership.is_dispatch) {
				div2.className += ' plugin-iago-dispatch';
			}
			if (this.locrecord_.membership.is_moderator) {
				div2.className += ' plugin-iago-moderator';
			}
			if (this.locrecord_.membership.is_admin) {
				div2.className += ' plugin-iago-admin';
			}
			div2.title = this.locrecord_.user.nickname + ' - ' + this.moment_.fromNow();
			// TODO: do better?
			div2.innerHTML = this.locrecord_.user.nickname + '<br>' + this.moment_.fromNow();
			div.appendChild(div2);
			this.div_ = div;
			var panes = this.getPanes();
			panes.overlayImage.appendChild(div);
		};
		UserMarker.prototype.onRemove = function() {
			this.div_.parentNode.removeChild(this.div_);
			this.div_ = null;
		};
		UserMarker.prototype.draw = function() {
			var overlayProjection = this.getProjection();
			var pos = overlayProjection.fromLatLngToDivPixel(this.position_);
			var div = this.div_;
			div.style.left = pos.x + 'px';
			div.style.top = pos.y + 'px';
			//div.style.opacity = Math.max(0.6, 1 - (moment().diff(this.moment_, 'minutes', true) / 60));
		};

		var PortalMarker = function(map, position, portal, is_volatile) {
			this.map_ = map;
			this.position_ = position;
			this.portal_ = portal;
			this.is_volatile_ = is_volatile;
			this.div_ = null;
			this.setMap(map);
		};
		PortalMarker.prototype = new google.maps.OverlayView();
		PortalMarker.prototype.onAdd = function() {
			var div = document.createElement('div');
			div.className = 'iago-volatile-marker';
			var div2 = document.createElement('div');
			div2.className = this.is_volatile_ ? 'plugin-iago-volatile' : 'plugin-iago-portal';
			div2.innerHTML = this.is_volatile_ ? 'V' : 'P';
			div.appendChild(div2);
			this.div_ = div;
			var panes = this.getPanes();
			panes.overlayImage.appendChild(div);
		};
		PortalMarker.prototype.onRemove = function() {
			this.div_.parentNode.removeChild(this.div_);
			this.div_ = null;
		};
		PortalMarker.prototype.draw = function() {
			var overlayProjection = this.getProjection();
			var pos = overlayProjection.fromLatLngToDivPixel(this.position_);
			var div = this.div_;
			div.style.left = pos.x + 'px';
			div.style.top = pos.y + 'px';
		};


		if(typeof window.plugin !== 'function') window.plugin = function() {};

		window.plugin.iago = function(){};
		window.plugin.iago.api_token = window.localStorage['iago_api_token'];
		window.plugin.iago.user = null;
		window.plugin.iago.status = null;
		window.plugin.iago.refreshTimer = null;
		// marker array
		window.plugin.iago.agents = [];
		window.plugin.iago.clusters = [];
		window.plugin.iago.geometry = [];
		window.plugin.iago.portals = {};
		window.plugin.iago.volatiles = {};

		var hidden, visibilityChange;
		if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
			hidden = "hidden";
			visibilityChange = "visibilitychange";
		} else if (typeof document.mozHidden !== "undefined") {
			hidden = "mozHidden";
			visibilityChange = "mozvisibilitychange";
		} else if (typeof document.msHidden !== "undefined") {
			hidden = "msHidden";
			visibilityChange = "msvisibilitychange";
		} else if (typeof document.webkitHidden !== "undefined") {
			hidden = "webkitHidden";
			visibilityChange = "webkitvisibilitychange";
		}
		window.jQuery(document).on(visibilityChange, function(){
			if (!document[hidden] && !window.plugin.iago.refreshTimer) {
				window.plugin.iago.refreshMapData();
			}
		});

		var error_table = {
			'OPERATION_NOT_FOUND': 'The operation does not exist.',
			'NOT_SUPPORTED': 'This action is not supported for this operation.',
			'CLUSTER_NOT_FOUND': 'That cluster does not exist.',
			'INCOMPLETE_REQUEST': 'You need to specify more data for the request.',
			'VOLATILE_EXISTS': 'The portal is already marked as volatile.',
			'VOLATILE_NOT_FOUND': 'That portal is not marked as volatile.',
			'PORTAL_EXISTS': 'The portal is already marked as interesting.',
			'PORTAL_NOT_FOUND': 'That portal is not marked as interesting.',
			'NOT_AUTHORIZED': 'You do not have permission to perform this action.',
			'ALREADY_A_MEMBER': 'Already a member of this operation.',
			'ALREADY_INVITED': 'This user has already been invited to this operation.',
			'NOT_A_MEMBER': 'Not a member of this operation.',
			'USER_NOT_FOUND': 'User not found.',
			'MEMBER_NOT_FOUND': 'Member not found.',
			'INVALID_PASSCODE': 'That was not a valid passcode.',
		};

		window.plugin.iago.rpc = function(endpoint, params, success) {
			params.api_token = window.plugin.iago.api_token;
			window.jQuery.ajax({
				url: 'https://intel-dot-iago-map.appspot.com/rpc/' + endpoint,
				type: 'POST',
				contentType: 'application/json; charset=utf-8',
				data: JSON.stringify({params:params}),
				dataType: 'json',
				xhrFields: {
					withCredentials: true
				},
				error: function() {
					console.log('IAGO RPC error for ' + endpoint + ':');
					console.log(arguments);
					alert('Failed to talk to IAGO');
				},
				success: function(r) {
					if (!('result' in r)) {
						console.log('IAGO RPC success error for ' + endpoint + ':');
						console.log(r);
						if ('error' in r) {
							errmsg = r['error'];
							if (errmsg in error_table) {
								errmsg = error_table[errmsg];
							}
							alert('Received error from IAGO:\n\n' + errmsg);
						}
						return;
					}
					console.log('IAGO RPC success for ' + endpoint + ':');
					success(r.result);
				},
			});
		};

		window.plugin.iago.checkCredentials = function(silent) {
			window.jQuery('#iago').text("\u21bb").addClass('iago-spinner');
			plugin.iago.rpc('test', {}, function(r) {
				window.jQuery('#iago').removeClass('iago-spinner');
				plugin.iago.status = r.state;
				plugin.iago.user = r.user;
				var params = {};
				if (window.localStorage['iago']) {
					params = JSON.parse(window.localStorage['iago']);
				}
				params['status'] = r.state;
				params['user'] = r.user;
				window.localStorage['iago'] = JSON.stringify(params);
				window.jQuery('#iago').text('Log into IAGO');
				if (r.state == 'OK') {
					// set up stuff
					window.plugin.iago.onLogin();
				} else if (silent) {
					return;
				} else if (r.state == 'MUST_LOGIN') {
					alert('Please provide a correct API token from www.iago.io');
				} else if (r.state == 'MUST_REGISTER') {
					alert('Please register for IAGO, then close the popup window and try again.');
					var newWindow = window.open('http://www.iago.io/');
					if (window.focus) newWindow.focus();
				} else if (r.state == 'APPROVAL_REQUIRED') {
					alert('Your IAGO account needs approval. Please install the app and meet with a trusted user.');
				} else if (r.state == 'MUST_ACCEPT_TOS') {
					alert('You need to accept the terms of service in the Android app.');
				} else {
					alert('Unknown IAGO account state: ' + r.state);
				}
			});
		};

		window.plugin.iago.onLoginClick = function() {
			window.localStorage['iago_api_token'] = prompt('Please enter your IAGO API token from www.iago.io');
			window.plugin.iago.api_token = window.localStorage['iago_api_token'];
			window.plugin.iago.checkCredentials();
		};

		window.plugin.iago.logout = function() {
			// stop updates and clear map
			if (window.plugin.iago.refreshTimer) {
				clearTimeout(plugin.iago.refreshTimer);
			}
			window.plugin.iago.clearAgents();

			// clear data
			delete window.localStorage['iago_api_token'];
			delete window.localStorage['iago_op_guid'];
			delete window.localStorage['iago'];
			window.plugin.iago.api_token = null;

			// update header
			window.jQuery('#iago').text('Log into IAGO').off('click.iago-drop').on('click.iago-login', window.plugin.iago.onLoginClick);
		};

		var locationTimestamp = 0, clusterTimestamp = 0, geometryTimestamp = 0, portalTimestamp = 0, volatileTimestamp = 0;

		var latLngFromE6 = function(l) {
			return new google.maps.LatLng(l.latE6 / 1e6, l.lngE6 / 1e6);
		};
		var parseColor = function(col) {
			if (/^#.{8}$/.test(col)) {
				return '#' + col.substr(3);
			}
			return col;
		};
		var parseAlpha = function(col) {
			if (/^#.{8}$/.test(col)) {
				return parseInt(col.substr(1, 2), 16) / 255;
			}
			return 0.8; // default alpha
		};

		window.plugin.iago.refreshMapData = function() {
			if (window.plugin.iago.refreshTimer) {
				clearTimeout(plugin.iago.refreshTimer);
				window.plugin.iago.refreshTimer = null;
			}
			if (hidden && document[hidden]) {
				return;
			}

			if (!window.plugin.iago.operation) {
				return;
			}

			var rpcStart = +new Date();
			window.plugin.iago.rpc('map/getData', {
				operation: window.plugin.iago.operation.guid,
				location_timestamp: locationTimestamp,
				cluster_timestamp: clusterTimestamp,
				geometry_timestamp: geometryTimestamp,
				portal_timestamp: portalTimestamp,
				volatile_timestamp: volatileTimestamp
			},
			function(r) {
				if (r.locations !== null) {
					// our cache is out of date; clear and rebuild
					window.plugin.iago.clearAgents();
					for (var i = 0; i < r.locations.length; ++i) {
						var l = r.locations[i];
						var point = latLngFromE6(l.loc);
						// add marker with additional info
						window.plugin.iago.agents.push(
							new UserMarker(nemesis.dashboard.maputils.map, point, l)
						);
					}
					locationTimestamp = rpcStart;
				}
				if (r.clusters !== null) {
					// our cache is out of date; clear and rebuild
					window.plugin.iago.clearClusters();
					for (var i = 0; i < r.clusters.length; ++i) {
						var c = r.clusters[i];
						var points = window.jQuery.map(c.vertices, latLngFromE6);
						// add cluster with additional info
						window.plugin.iago.clusters.push(
							new google.maps.Polygon({
								map: nemesis.dashboard.maputils.map,
								paths: points,
								strokeColor: '#FF0000',
								strokeOpacity: 0.8,
								strokeWeight: 2,
								fillColor: '#FF0000',
								fillOpacity: 0.35
							})
						);
					}
					clusterTimestamp = rpcStart;
				}
				if (r.geometry !== null) {
					// our cache is out of date; clear and rebuild
					window.plugin.iago.clearGeometry();
					for (var i = 0; i < r.geometry.length; ++i) {
						var g = r.geometry[i];
						switch (g.type) {
							// TODO: other cases
							case 'PATH':
							case 'LINE':
								var points = window.jQuery.map(g.vertices, latLngFromE6);
								// add cluster with additional info
								window.plugin.iago.geometry.push(
									new google.maps.Polyline({
										map: nemesis.dashboard.maputils.map,
										geodesic: true,
										path: points,
										strokeColor: parseColor(g.stroke),
										strokeOpacity: parseAlpha(g.stroke),
										strokeWeight: g.stroke_width
									})
								);
								break;
							case 'POLYGON':
								var points = window.jQuery.map(g.vertices, latLngFromE6);
								// add cluster with additional info
								window.plugin.iago.geometry.push(
									new google.maps.Polygon({
										map: nemesis.dashboard.maputils.map,
										geodesic: true,
										paths: points,
										strokeColor: parseColor(g.stroke),
										strokeOpacity: parseAlpha(g.stroke),
										strokeWeight: g.stroke_width,
										fillColor: parseColor(g.fill),
										fillOpacity: parseAlpha(g.fill)
									})
								);
								break;
						}
					}
					geometryTimestamp = rpcStart;
				}
				if (r.portals !== null) {
					window.plugin.iago.clearPortals();
					for (var i = 0; i < r.portals.length; ++i) {
						var p = r.portals[i];
						var point = latLngFromE6(p.location);
						// add cluster with additional info
						window.plugin.iago.portals[p.guid] = new PortalMarker(nemesis.dashboard.maputils.map, point, p, false);
					}
					portalTimestamp = rpcStart;
				}
				if (r.volatiles !== null) {
					window.plugin.iago.clearVolatiles();
					for (var i = 0; i < r.volatiles.length; ++i) {
						var v = r.volatiles[i];
						var point = latLngFromE6(v.location);
						// add cluster with additional info
						window.plugin.iago.volatiles[v.guid] = new PortalMarker(nemesis.dashboard.maputils.map, point, v, true);
					}
					volatileTimestamp = rpcStart;
				}
			});
			if (!hidden || !document[hidden]) {
				window.plugin.iago.refreshTimer = setTimeout(window.plugin.iago.refreshMapData, 30 * 1000);
			}
		};

		window.plugin.iago.clearAgents = function() {
			// iterate over all markers and delete them
			for (var i = 0; i < window.plugin.iago.agents.length; ++i) {
				var agentMarker = window.plugin.iago.agents[i];
				agentMarker.setMap(null);
				agentMarker = null;
			}
			// empty array
			window.plugin.iago.agents = [];
		};

		window.plugin.iago.clearClusters = function() {
			// iterate over all clusters and delete them
			for (var i = 0; i < window.plugin.iago.clusters.length; ++i) {
				var cluster = window.plugin.iago.clusters[i];
				cluster.setMap(null);
				cluster = null;
			}
			// empty array
			window.plugin.iago.clusters = [];
		};

		window.plugin.iago.clearGeometry = function() {
			// iterate over all geometry items and delete them
			for (var i = 0; i < window.plugin.iago.geometry.length; ++i) {
				var geometry = window.plugin.iago.geometry[i];
				geometry.setMap(null);
				geometry = null;
			}
			// empty array
			window.plugin.iago.geometry = [];
		};

		window.plugin.iago.clearPortals = function() {
			// iterate over all portals and delete them
			for (var i in window.plugin.iago.portals) {
				var vol = window.plugin.iago.portals[i];
				vol.setMap(null);
				vol = null;
			}
			// empty array
			window.plugin.iago.portals = {};
		};

		window.plugin.iago.clearVolatiles = function() {
			// iterate over all volatiles and delete them
			for (var i in window.plugin.iago.volatiles) {
				var vol = window.plugin.iago.volatiles[i];
				vol.setMap(null);
				vol = null;
			}
			// empty array
			window.plugin.iago.volatiles = {};
		};

		window.plugin.iago.onLogin = function() {
			window.jQuery('#iago')
				.off('click.iago-login')
				.on('click.iago-drop', window.plugin.iago.onDropdownClick);
			var host = window.jQuery('#iago-ops').html('');
			plugin.iago.user.operations.sort(function (a, b) {
				if (a.operation.name.toLocaleLowerCase() > b.operation.name.toLocaleLowerCase()) return 1;
				if (a.operation.name.toLocaleLowerCase() < b.operation.name.toLocaleLowerCase()) return -1;
				return 0;
			});
			var now = +new Date();
			for (var i = 0; i < plugin.iago.user.operations.length; ++i) {
				var o = plugin.iago.user.operations[i].operation;
				if (!plugin.iago.user.admin && o.ends_ms < now) {
					// if op ended in the past, do not show it
					continue;
				}
				window.jQuery('<div class="iago-op"/>').data('guid', o.guid).text(o.name).appendTo(host);
				if (o.guid === localStorage['iago_op_guid']) {
					window.plugin.iago.operation = o;
				}
			}
			if (plugin.iago.user.operations.length == 1) {
				plugin.iago.operation = plugin.iago.user.operations[0].operation;
				localStorage['iago_op_guid'] = plugin.iago.operation.guid;
			}
			window.plugin.iago.onOperationChanged();
		};

		window.plugin.iago.announceCurrentVolatile = function() {
			var p = nemesis.dashboard.render.PortalInfoOverlay.getCurrentPortal();
			if (!p) {
				alert('Select a portal before announcing it as volatile');
				return;
			}
			if (!plugin.iago.operation) {
				alert('Select an operation before announcing a volatile portal');
				return;
			}
			var params = {
				operation: window.plugin.iago.operation.guid,
				portal_guid: p.guid,
				title: p.title,
				latE6: (p.lat * 1e6) | 0,
				lngE6: (p.lng * 1e6) | 0,
				image_url: p.image ? p.image.replace(/=[sc][0-9]+$/, '') : null,
			};
			window.plugin.iago.rpc('volatile/announce', params, function(r) {
				// TODO: flash message
				alert('Done!');
			});
		};

		window.plugin.iago.retractCurrentVolatile = function() {
			var p = nemesis.dashboard.render.PortalInfoOverlay.getCurrentPortal();
			if (!p) {
				alert('Select a portal before retracting its volatility');
				return;
			}
			if (!plugin.iago.operation) {
				alert('Select an operation before retracting a volatile portal');
				return;
			}
			var params = {
				operation: window.plugin.iago.operation.guid,
				portal_guid: p.guid
			};
			window.plugin.iago.rpc('volatile/retract', params, function(r) {
				// TODO: flash message
				alert('Done!');
			});
		};

		window.plugin.iago.addCurrentPortal = function() {
			var p = nemesis.dashboard.render.PortalInfoOverlay.getCurrentPortal();
			if (!p) {
				alert('Select a portal before trying to add it');
				return;
			}
			if (!plugin.iago.operation) {
				alert('Select an operation before trying to add a portal to it');
				return;
			}
			var params = {
				operation: window.plugin.iago.operation.guid,
				portal_guid: p.guid,
				title: p.title,
				latE6: (p.lat * 1e6) | 0,
				lngE6: (p.lng * 1e6) | 0,
				image_url: p.image ? p.image.replace(/=[sc][0-9]+$/, '') : null,
			};
			window.plugin.iago.rpc('portal/add', params, function(r) {
				// TODO: flash message
				alert('Done!');
			});
		};

		window.plugin.iago.deleteCurrentPortal = function() {
			var p = nemesis.dashboard.render.PortalInfoOverlay.getCurrentPortal();
			if (!p) {
				alert('Select a portal before trying to remove it');
				return;
			}
			if (!plugin.iago.operation) {
				alert('Select an operation before trying to remove a portal from it');
				return;
			}
			var params = {
				operation: window.plugin.iago.operation.guid,
				portal_guid: p.guid
			};
			window.plugin.iago.rpc('portal/delete', params, function(r) {
				// TODO: flash message
				alert('Done!');
			});
		};

		window.plugin.iago.rpcClearVolatiles = function() {
			var confirmed = confirm('Are you sure you want to clear ALL volatile portals in this operation?');
			if (!confirmed) {
				return;
			}
			var params = {
				operation: window.plugin.iago.operation.guid
			};
			window.plugin.iago.rpc('volatile/clear', params, function(r) {
				// TODO: flash message
				window.plugin.iago.clearVolatiles();
			});
		};

		window.plugin.iago.windowStart = function() {
			var params = {
				operation: window.plugin.iago.operation.guid
			};
			window.plugin.iago.rpc('volatileWindow/start', params, function(r) {});
		};

		window.plugin.iago.windowEnd = function() {
			var params = {
				operation: window.plugin.iago.operation.guid
			};
			window.plugin.iago.rpc('volatileWindow/end', params, function(r) {});
		};

		window.plugin.iago.onOperationChanged = function() {
			var topText = 'IAGO: ' + plugin.iago.user.nickname;
			if (window.plugin.iago.operation) {
				topText += ' / ' + plugin.iago.operation.name;
			}
			window.jQuery('#iago')
				.text(topText)
				.append('&nbsp;<div class="iago-topbar-arrow"/>')
			window.jQuery('.iago-op')
				.removeClass('iago-op-selected')
				.each(function(){
					if (plugin.iago.operation && (window.jQuery(this).data('guid') == plugin.iago.operation.guid)) {
						window.jQuery(this).addClass('iago-op-selected');
					}
				});
			plugin.iago.clearClusters();
			plugin.iago.clearPortals();
			plugin.iago.clearVolatiles();
			if (window.plugin.iago.operation) {
				setTimeout(function(){
					window.plugin.iago.refreshMapData();
				}, 250);
			}
		};

		window.plugin.iago.onDropdownClick = function(e) {
			window.jQuery('#iago').toggleClass('show_box');
			e.stopImmediatePropagation();
		};

		window.plugin.iago.onOperationClick = function(e) {
			var guid = window.jQuery(e.target).data('guid');
			window.plugin.iago.operation = null;
			for (var i = 0; i < plugin.iago.user.operations.length; ++i) {
				var o = plugin.iago.user.operations[i].operation;
				if (o.guid === guid) {
					window.plugin.iago.operation = o;
					break;
				}
			}
			localStorage['iago_op_guid'] = plugin.iago.operation ? plugin.iago.operation.guid : null;
			window.plugin.iago.onOperationChanged();
		};

		window.plugin.iago.setupIAGO = function() {
			var html = '<div class="pointer iago-topbar" id="iago">Log into IAGO</div>' +
				'<div class="iago-box header_box" id="iago-box">' +
				'<div id="iago-ops" class="pointer iago-menu-border-after"></div>' +
				'<div id="iago-announce" class="pointer">Announce current portal as volatile</div>' +
				'<div id="iago-retract" class="pointer">Retract current portal volatility</div>' +
				'<div id="iago-clear-volatiles" class="pointer iago-menu-border-after">Clear all volatiles</div>' +
				'<div id="iago-addportal" class="pointer">Add current portal of interest</div>' +
				'<div id="iago-delportal" class="pointer iago-menu-border-after">Remove current portal of interest</div>' +
				'<div id="iago-windowstart" class="pointer">Announce volatile window open</div>' +
				'<div id="iago-windowend" class="pointer iago-menu-border-after">Announce volatile window closed</div>' +
				'<div id="iago-logout" class="pointer">Log out of IAGO</div>' +
				'</div>';
			addHTMLByElementId(html, 'header_login_info_box', 'afterend');
			window.jQuery('#iago-box').css('right', window.jQuery('#header_login_info').width() + parseInt(window.jQuery('#header_login_info_box').css('right'), 10));
			// add onclick handler
			window.jQuery('#iago').on('click.iago-login', window.plugin.iago.onLoginClick);
			window.jQuery('#iago-ops').on('click', window.plugin.iago.onOperationClick);
			window.jQuery('#iago-announce').on('click', window.plugin.iago.announceCurrentVolatile);
			window.jQuery('#iago-retract').on('click', window.plugin.iago.retractCurrentVolatile);
			window.jQuery('#iago-clear-volatiles').on('click', window.plugin.iago.rpcClearVolatiles);
			window.jQuery('#iago-addportal').on('click', window.plugin.iago.addCurrentPortal);
			window.jQuery('#iago-delportal').on('click', window.plugin.iago.deleteCurrentPortal);
			window.jQuery('#iago-windowstart').on('click', window.plugin.iago.windowStart);
			window.jQuery('#iago-windowend').on('click', window.plugin.iago.windowEnd);
			window.jQuery('#iago-logout').on('click', window.plugin.iago.logout);
			if (window.localStorage['iago'] !== null) {
				window.plugin.iago.checkCredentials(true);
			}
		};

		// Loading custom CSS styles
		addGlobalStyles(
			".iago-topbar { color: #ebbc4a; display: block; float: right; font-family: coda_regular, arial, helvetica, sans-serif; font-size: 12px; height: 18px; margin-right: 10px; margin-top: 10px; text-align: center; vertical-align: top; font-family:coda_regular, arial, helvetica, sans-serif; }\n" +
			".iago-topbar-arrow { margin-left: 1ex; border: 5px solid transparent; border-bottom-width: 0; border-top-color: #ebbc4a; display: inline-block; }\n" +
			".show_box > .iago-topbar-arrow { border-top: 0; border-top-color: transparent; border-bottom-width: 5px; border-bottom-color: #ebbc4a; }\n" +
			".iago-spinner{ -webkit-animation: spinner 1s infinite linear; animation: spinner 1s infinite linear; }\n" +
			".iago-menu-border-after { border-bottom: 1px solid #ebbc4a; margin-bottom: 5px; padding-bottom: 5px; }\n" +
			".iago-menu-border-after:empty { border-bottom: 0; margin: 0; padding: 0; }\n" +
			"@-webkit-keyframes spinner { from {-webkit-transform: rotate(0deg);} to {-webkit-transform: rotate(359deg);} }\n" +
			"@keyframes spinner { from {transform: rotate(0deg);} to {transform: rotate(359deg);} }\n" +
			".iago-marker{ background:transparent;border:0;font-family:'Roboto', sans-serif;font-weight:100;color:#000099 !important;position:absolute;width:125px;height:50px;margin-top:-50px;margin-left:-52px; }\n" +
			".iago-marker:hover{ opacity:1 !important; z-index: 15000 !hover }\n" +
			".iago-volatile-marker{ background:transparent;border:0;font-family:'Roboto', sans-serif;font-weight:800;color:#ebbc4a !important;position:absolute;width:25px;height:31px;margin-top:-31px;margin-left:-13px; }\n" +
			".iago-op-selected:before{ content: '» ' }\n" +

			".plugin-iago-player { text-align:center;position: relative; width: 105px; height: 40px; padding: 0px; background: #AACCFF; -webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px; border: #000099 solid 1px; color:#000099 !important }\n"+
			".plugin-iago-player:after { content: ''; position: absolute; border-style: solid; border-width: 10px 5px 0; border-color: #AACCFF transparent; display: block; width: 0; z-index: 1; bottom: -10px; left: 47px; }\n"+
			".plugin-iago-player:before { content: ''; position: absolute; border-style: solid; border-width: 10px 5px 0; border-color: #000099 transparent; display: block; width: 0; z-index: 0; bottom: -11px; left: 47px; }\n"+

			".plugin-iago-player.plugin-iago-captain { background: #0063F8; border-color: #000099; color: #eeeeee !important }\n"+
			".plugin-iago-player.plugin-iago-captain:after { border-color: #0063F8 transparent; }\n"+
			".plugin-iago-player.plugin-iago-captain:before { border-color: #000099 transparent; }\n"+

			".plugin-iago-portal { text-align:center;position: relative; width: 25px; height: 21px; padding: 0px; background: #d05fff; -webkit-border-radius: 50px; -moz-border-radius: 50px; border-radius: 50px; border: #8d00c8 solid 1px; color:#ffffff !important }\n"+
			".plugin-iago-portal:after { content: ''; position: absolute; border-style: solid; border-width: 10px 5px 0; border-color: #d05fff transparent; display: block; width: 0; z-index: 1; bottom: -10px; left: 7px; }\n"+
			".plugin-iago-portal:before { content: ''; position: absolute; border-style: solid; border-width: 10px 5px 0; border-color: #8d00c8 transparent; display: block; width: 0; z-index: 0; bottom: -11px; left: 7px; }\n"+

			".plugin-iago-volatile { text-align:center;position: relative; width: 25px; height: 21px; padding: 0px; background: #ebbc4a; -webkit-border-radius: 50px; -moz-border-radius: 50px; border-radius: 50px; border: #77580d solid 1px; color:#000000 !important }\n"+
			".plugin-iago-volatile:after { content: ''; position: absolute; border-style: solid; border-width: 10px 5px 0; border-color: #ebbc4a transparent; display: block; width: 0; z-index: 1; bottom: -10px; left: 7px; }\n"+
			".plugin-iago-volatile:before { content: ''; position: absolute; border-style: solid; border-width: 10px 5px 0; border-color: #77580d transparent; display: block; width: 0; z-index: 0; bottom: -11px; left: 7px; }\n"
		);

		console.log("IAGO loaded.");
		window.plugin.iago.setupIAGO();
	}); // end injectJS
}; // end load

var init = function() {
	var script = document.createElement("script");
	script.setAttribute("src", "//ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js");
	script.addEventListener('load', function() {
		var script = document.createElement("script");
		script.textContent = "window.jQuery=jQuery.noConflict(true);";
		document.body.appendChild(script);
		// load moment.js
		var script = document.createElement("script");
		script.setAttribute("src", "//cdnjs.cloudflare.com/ajax/libs/moment.js/2.4.0/moment.min.js");
		script.addEventListener('load', initMain, false);
		document.body.appendChild(script);
	}, false);
	document.body.appendChild(script);
};

init();
