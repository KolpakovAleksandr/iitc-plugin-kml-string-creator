// ==UserScript==
// @id             io.iago.iitc
// @name           IITC: IAGO integration
// @category       Misc
// @version        0.3.2.20140517.120129
// @namespace      http://www.iago.io/
// @description    [iago-2014-05-17-120129] IAGO integration for IITC
// @updateURL      http://intel.ssergni.com/iitc.iago.meta.js
// @downloadURL    http://intel.ssergni.com/iitc.iago.user.js
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==


function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'local';
plugin_info.dateTimeVersion = '20140517.120129';
plugin_info.pluginId = 'iitc.iago';
//END PLUGIN AUTHORS NOTE



// TODO: add updateURL/downloadURL

// to disable IITC update check
delete plugin_info.buildName;
delete plugin_info.dateTimeVersion;
delete plugin_info.pluginId;

// PLUGIN START ////////////////////////////////////////////////////////
var HIGHLIGHTER_NAME = 'IAGO operation portals';

plugin.iago = function() {};
plugin.iago.api_token = localStorage['iago_api_token'];
plugin.iago.user = null;
plugin.iago.state = 'MUST_LOGIN';
plugin.iago.refreshTimer = null;
plugin.iago.isActiveHighlighter = false;
plugin.iago.status = 'Loading...';

plugin.iago.rpc = function(endpoint, params, success) {
	params.api_token = plugin.iago.api_token;
	$.ajax({
		url: 'https://iitc-dot-iago-map.appspot.com/rpc/' + endpoint,
		type: 'POST',
		contentType: 'application/json; charset=utf-8',
		data: JSON.stringify({params:params}),
		dataType: 'json',
		xhrFields: {
			withCredentials: true
		},
		error: function() {
			console.error('IAGO RPC error for ' + endpoint + ':', arguments);
			alert('Failed to talk to IAGO');
			plugin.iago.render('MUST_LOGIN');
		},
		success: function(r) {
			if(!('result' in r)) {
				console.error('IAGO RPC success error for ' + endpoint + ':', r);
				alert('Received error from IAGO');
				return;
			}
			//console.log('IAGO RPC success for ' + endpoint + ':', r);
			success(r.result);
		},
	});
};

var clusterTimestamp = 0, geometryTimestamp = 0, locationTimestamp = 0, portalTimestamp = 0, targetTimestamp = 0,
    volatileTimestamp = 0, waypointTimestamp = 0;

var latLngFromE6 = function(l) {
	return L.latLng(l.latE6 / 1e6, l.lngE6 / 1e6 );
};

var formatTime = function(time) {
	var now = moment();
	var then = moment(time);

	var str = '';
	if(!then.isSame(now, 'day'))
		str = then.format('YYYY-MM-DD ');

	str += then.format('HH:mm:ss');
	str += ' (' + then.fromNow()+ ')';
	return str;
}

var parseColor = function(col) {
	if (/^#.{8}$/.test(col)) {
		return '#' + col.substr(3);
	}
	return col;
};
var parseAlpha = function(col, def) {
	if (/^#.{8}$/.test(col)) {
		return parseInt(col.substr(1, 2), 16) / 255;
	}
	return def === undefined ? 1 : def;
};

plugin.iago.logout = function() {
	if(plugin.iago.refreshTimer) {
		clearTimeout(plugin.iago.refreshTimer);
	}

	delete localStorage.iago;
	delete localStorage.iago_api_token;
	delete localStorage.iago_op_guid;

	plugin.iago.operation = null;
	plugin.iago.operationData = null;
	plugin.iago.api_token = '';
	plugin.iago.user = null;
	plugin.iago.state = 'MUST_LOGIN';

	plugin.iago.onOperationChanged();
	plugin.iago.render('MUST_LOGIN');
}

plugin.iago.refreshMapData = function() {
	if(plugin.iago.refreshTimer) {
		clearTimeout(plugin.iago.refreshTimer);
	}

	if(window.isIdle()) return;

	if(!plugin.iago.operation) return;

	var rpcStart = Date.now();
	plugin.iago.rpc('map/getData', {
		operation: plugin.iago.operation.guid,
		cluster_timestamp: clusterTimestamp,
		geometry_timestamp: geometryTimestamp,
		location_timestamp: locationTimestamp,
		portal_timestamp: portalTimestamp,
		target_timestamp: targetTimestamp,
		volatile_timestamp: volatileTimestamp,
		//waypoint_timestamp: waypointTimestamp,
	},
	function(response) {
		if(plugin.iago.operationData === null) {
			plugin.iago.operationData = response;
		} else {
			// copy properties that aren't null
			for(var attr in response) {
				if(response.hasOwnProperty(attr) && response[attr] !== null)
					plugin.iago.operationData[attr] = response[attr];
			}
		}
		plugin.iago.status = 'Last refresh: ' + (new Date).toLocaleTimeString();
		plugin.iago.render();
		plugin.iago.onOperationDataChanged(rpcStart);
	});

	plugin.iago.render();
	plugin.iago.refreshTimer = setTimeout(plugin.iago.refreshMapData, 30 * 1000);
};

plugin.iago.drawLocations = function(userLocations, layer) {
	// our cache is out of date; clear and rebuild
	layer.clearLayers();
	userLocations.forEach(function(userLocation) {
		var icon = userLocation.membership.is_captain ? plugin.iago.iconCaptain : plugin.iago.iconPlayer;

		var timestamp = moment(userLocation.loc.recorded_ms);
		var timestring = formatTime(timestamp);
		var absOpacity = Math.max(0.5, 1 - (moment().diff(timestamp, 'minutes', true) / 60));

		var marker = L.marker(latLngFromE6(userLocation.loc), {
			icon: new icon(),
			opacity: absOpacity,
			zIndexOffset: 10000,
			title: userLocation.user.nickname + ' - ' + timestring
		});

		var speed = (userLocation.loc.speed > 0.5)
			? (Math.round(userLocation.loc.speed*10) / 10) + 'm/s ('
			+ (Math.round(userLocation.loc.speed * 10 * 3.6) / 10) + 'km/h)'
			: 'Not moving';

		var popup = $('<div>')
			.append($('<span class="nickname ' + (userLocation.user.faction == 'RESISTANCE' ? 'res' : 'enl') + '">')
				.text(userLocation.user.nickname))
			.append($('<span>')
				.text(' — ' + timestring))
			.append('<br>')
			.append($('<span>')
				.text(speed));

		var details = L.layerGroup();

		var circle = L.circle(latLngFromE6(userLocation.loc), userLocation.loc.acc, {
			fill: false,
			color: '#FF7F00',
			weight: 2,
			clickable: false
		});
		details.addLayer(circle);

		if(userLocation.prev) {
			popup
				.append('<br>')
				.append($('<span>')
					.text('Previous location: ' + formatTime(userLocation.prev.recorded_ms)));

			var prev = L.marker(latLngFromE6(userLocation.prev), {
				icon: new icon(),
				opacity: absOpacity * 0.5,
				zIndexOffset: 9000,
			});

			var line = L.geodesicPolyline([latLngFromE6(userLocation.prev), latLngFromE6(userLocation.loc)], {
				color: '#0FF',
				opacity: 1,
				weight: 2,
				clickable: false,
			});

			var circle = L.circle(latLngFromE6(userLocation.prev), userLocation.prev.acc, {
				fill: false,
				color: '#FF7F00',
				weight: 1,
				clickable: false
			});

			details
				.addLayer(circle)
				.addLayer(line)
				.addLayer(prev);
		}

		marker
			.bindPopup(L.popup({
					className: 'iago-popup iago-agent-popup'
				})
				.on('open', function() { layer.addLayer(details); $(marker._icon).tooltip('close'); })
				.on('close', function() { layer.removeLayer(details); })
				.setContent(popup[0]))
			// ensure tooltips are closed, sometimes they linger
			.on('mouseout', function() { $(marker._icon).tooltip('close'); })
			.addTo(layer);

		// jQueryUI doesn't automatically notice the new markers
		window.setupTooltips($(marker._icon));
	});
}

plugin.iago.drawClusters = function(clusters, layer) {
	// our cache is out of date; clear and rebuild
	layer.clearLayers();
	clusters.forEach(function(cluster) {
		var vertices = cluster.vertices,
		    len = vertices.length;
		    latlngs = vertices.map(latLngFromE6);
		
		// center of polygon
		// http://web.archive.org/web/20120328195447/http://local.wasp.uwa.edu.au/~pbourke/geometry/polyarea/
		var area = vertices.map(function(v1, i, vertices) {
			var v2 = vertices[(i+1)%len];
			return v1.latE6 * v2.lngE6 - v2.latE6 * v1.lngE6;
		}).reduce(function(a, b) {
			return a+b;
		}) / 2;
		var center = vertices.map(function(v1, i, vertices) {
			var v2 = vertices[(i+1)%len];
			
			var lat = (v1.latE6 + v2.latE6) * (v1.latE6 * v2.lngE6 - v2.latE6 * v1.lngE6);
			var lng = (v1.lngE6 + v2.lngE6) * (v1.latE6 * v2.lngE6 - v2.latE6 * v1.lngE6);
			return [lat, lng];
		}).reduce(function(a, b) {
			return [a[0]+b[0], a[1]+b[1]];
		});
		center = latLngFromE6({
			latE6: center[0] / (6 * area),
			lngE6: center[1] / (6 * area),
		});
		
		var polygon = L.geodesicPolygon(latlngs, {
			clickable: false,
			weight: 2,
			stroke: true,
			color: '#C00',
			opacity: 1,
			fill: true,
			fillColor: '#C00',
			fillOpacity: 0.3
		}).addTo(layer);
		
		var marker = L.marker(center, {
			zIndexOffset: 10000,
			clickable: false,
			icon: L.divIcon({
				className: 'iago-icon iago-icon-cluster',
				iconAnchor: [35,8],
				iconSize: [70,16],
				html: cluster.name,
			})
		});
		
		marker
			// ensure tooltips are closed, sometimes they linger
			.on('mouseout', function() { $(marker._icon).tooltip('close'); })
			.addTo(layer);

		// jQueryUI doesn’t automatically notice the new markers
		window.setupTooltips($(marker._icon));
	});
}

plugin.iago.drawGeometries = function(geometries, layer) {
	// our cache is out of date; clear and rebuild
	layer.clearLayers();
	geometries.forEach(function(geometry) {
		var hasPopup = geometry.title !== null || geometry.details !== null;
		var options = {
			clickable: hasPopup,
			weight: geometry.stroke_width || 2,
			stroke: geometry.stroke !== null,
			color: parseColor(geometry.stroke) || '#C00',
			opacity: parseAlpha(geometries.stroke),
			fill: geometry.fill !== null,
			fillColor: parseColor(geometry.fill) || '#C00',
			fillOpacity: parseAlpha(geometry.fill, 0.3)
		};

		var latlngs = geometry.vertices.map(latLngFromE6);
		var feature;

		switch(geometry.type) {
			case 'CIRCLE':
				feature = L.circle(latlngs[0], geometry.radius, options);
				break;
			case 'LINE':
				if(geometry.flat)
					feature = L.polyline(latlngs, options);
				else
					feature = L.geodesicPolyline(latlngs, options);
				break;
			case 'MARKER':
				options.zIndexOffset = 10000;
				options.icon = plugin.iago.iconTarget;
				options.title = geometry.title || 'Unnamed marker';
				feature = L.marker(latlngs[0], options);
				// ensure tooltips are closed, sometimes they linger
				feature.on('mouseout', function() { $(feature._icon).tooltip('close'); })
				break;
			case 'POLYGON':
				if(geometry.flat)
					feature = L.polygon(latlngs, options)
				else
					feature = L.geodesicPolygon(latlngs, options);
				break;
			default:
				console.warn('Unknown geometry type: ', geometry.type);
		}
		
		feature.addTo(layer);
		
		if(hasPopup) {
			var content = $('<div>');

			if(geometry.title !== null)
				content.append($('<strong>').text(geometry.title));
			if(geometry.details !== null)
				content.append($('<div>').text(geometry.details));

			var popup = L.popup({
				className: 'iago-popup iago-geometry-popup'
			});
			popup.setContent(content[0]);

			if(geometry.type == 'MARKER') {
				feature.bindPopup(popup);
				popup.on('open', function() { $(feature._icon).tooltip('close'); })
			} else {
				feature.on('click', function(event) {
					popup.setLatLng(event.latlng);
					popup.openOn(map);
				});
			}
		}

		if(geometry.type == 'MARKER') {
			// jQueryUI doesn’t automatically notice the new markers
			window.setupTooltips($(feature._icon));
		}
	});
}

plugin.iago.drawPortals = function(portals, layer, icon) {
	// our cache is out of date; clear and rebuild
	layer.clearLayers();
	portals.forEach(function(portal) {
		var marker = L.marker(latLngFromE6(portal.location), {
			icon: new icon,
			zIndexOffset: 10000,
			title: portal.title
		});

		var popup = $('<div>')
			.append($('<div class="name">')
				.text(portal.title));
		if(portal.address) {
			popup.append($('<div class="address">').text(portal.address));
		}
		if(portal.portal_guid) {
			popup.append($('<a>')
				.text('details')
				.click(function() {
					renderPortalDetails(portal.portal_guid);
					if(isSmartphone())
						show('info');
				}));
		}
		if(typeof android !== 'undefined' && android && android.intentPosLink) {
			popup.append($('<a>')
				.text('IAGO')
				.click(function() {
					renderPortalDetails(portal.portal_guid);
					show('plugin-iago');
				}));
			popup.append($('<a>')
				.text('share')
				.click(function() {
					var ll = marker.getLatLng();
					android.intentPosLink(ll.lat, ll.lng, map.getZoom(), portal.title, true);
				}));
		}
		if(portal.image_url) {
			popup.append($('<img>')
				.attr('src', portal.image_url)
				.addClass('portalimage'));
		}

		marker
			.bindPopup(L.popup({
					className: 'iago-popup iago-portal-popup'
				})
				.on('open', function() { $(marker._icon).tooltip('close'); })
				.setContent(popup[0]))
			// ensure tooltips are closed, sometimes they linger
			.on('mouseout', function() { $(marker._icon).tooltip('close'); })
			.addTo(layer);

		// jQueryUI doesn’t automatically notice the new markers
		window.setupTooltips($(marker._icon));
	});
}

plugin.iago.highlight = function(data) {
	var guid = data.portal.options.ent[0];

	if(plugin.iago.isPortalVolatile(guid)) {
		data.portal.setStyle({fillColor: 'red'});
		return;
	}
	if(plugin.iago.isPortalAdded(guid)) {
		data.portal.setStyle({fillColor: 'white'});
		return;
	}
	if(plugin.iago.isPortalTarget(guid)) {
		data.portal.setStyle({fillColor: 'yellow'});
		return;
	}
}

plugin.iago.onHighlighterChanged = function(isActive) {
	plugin.iago.isActiveHighlighter = isActive;
}

plugin.iago.onOperationDataChanged = function(timestamp) {
	if(plugin.iago.isActiveHighlighter) {
		window.resetHighlightedPortals();
	}
	var data = plugin.iago.operationData;
	if(data !== null) {
		if(data.clusters !== null) {
			plugin.iago.drawClusters(data.clusters, plugin.iago.layerClusters);
			if(timestamp) clusterTimestamp = timestamp;
		}
		if(data.geometry !== null) {
			plugin.iago.drawGeometries(data.geometry, plugin.iago.layerGeometries);
			if(timestamp) geometryTimestamp = timestamp;
		}
		if(data.locations !== null) {
			plugin.iago.drawLocations(data.locations, plugin.iago.layerLocations);
			if(timestamp) locationTimestamp = timestamp;
		}
		if(data.portals !== null) {
			plugin.iago.drawPortals(data.portals, plugin.iago.layerPortals, plugin.iago.iconPortal);
			if(timestamp) portalTimestamp = timestamp;
		}
		if(data.targets !== null) {
			plugin.iago.drawPortals(data.targets, plugin.iago.layerTargets, plugin.iago.iconTarget);
			if(timestamp) targetTimestamp = timestamp;
		}
		if(data.volatiles !== null) {
			plugin.iago.drawPortals(data.volatiles, plugin.iago.layerVolatiles, plugin.iago.iconVolatile);
			if(timestamp) volatileTimestamp = timestamp;
		}
	}
}

plugin.iago.isPortalAdded = function(guid) {
	if(!(plugin.iago.operationData && plugin.iago.operationData.portals))
		return false;

	return plugin.iago.operationData.portals.some(function(portal) {
		return portal.portal_guid && portal.portal_guid == guid;
	});
}

plugin.iago.isPortalVolatile = function(guid) {
	if(!(plugin.iago.operationData && plugin.iago.operationData.volatiles))
		return false;

	return plugin.iago.operationData.volatiles.some(function(portal) {
		return portal.portal_guid && portal.portal_guid == guid;
	});
}

plugin.iago.isPortalTarget = function(guid) {
	if(!(plugin.iago.operationData && plugin.iago.operationData.targets))
		return false;

	return plugin.iago.operationData.targets.some(function(portal) {
		return portal.portal_guid && portal.portal_guid == guid;
	});
}

plugin.iago.checkCredentials = function() {
	plugin.iago.render('LOGGING_IN');

	plugin.iago.rpc('test', {}, function(r) {
		plugin.iago.state = r.state;
		plugin.iago.user = r.user;
		localStorage['iago'] = JSON.stringify({
			'state': r.state,
			'user': r.user,
		});

		plugin.iago.render();
		plugin.iago.onOperationChanged();
	});
};

plugin.iago.render = function(state) {
	if(state !== undefined)
		plugin.iago.state = state;
	else
		state = plugin.iago.state;

	var container = plugin.iago.container;
	container.html('');

	if(state == 'OK') {
		plugin.iago.user.operations.sort(function(a, b) {
			if(a.operation.name.toLocaleLowerCase() > b.operation.name.toLocaleLowerCase()) return 1;
			if(a.operation.name.toLocaleLowerCase() < b.operation.name.toLocaleLowerCase()) return -1;
			return 0;
		});

		var now = Date.now();
		var select = $('<select>')
			.change(function(ev) {
				plugin.iago.operation = null;
				//plugin.iago.render(); // to make sure operation specific buttons are removed
				if(ev.target.selectedIndex != 0) {
					var guid = ev.target.options[ev.target.selectedIndex].value;
					plugin.iago.user.operations.some(function(membership) {
						if(membership.operation.guid === guid) {
							plugin.iago.operation = membership.operation;
							return true;
						}
					});
				}
				localStorage['iago_op_guid'] = plugin.iago.operation ? plugin.iago.operation.guid : null;
				plugin.iago.status = 'Loading operation...';
				plugin.iago.onOperationChanged();
			});

		$('<option>')
			.appendTo(select)
			.prop({
				disabled: true,
				text: 'Select operation...',
				selected: true
			});

		plugin.iago.user.operations.forEach(function(membership) {
			var operation = membership.operation;
			if(!plugin.iago.user.admin && !membership.is_admin && operation.ends_ms < now)
				return; // if op ended in the past, do not show it

			$('<option>')
				.appendTo(select)
				.prop({
					value: operation.guid,
					text: operation.name,
					selected: operation.guid == localStorage['iago_op_guid']
				});

			if(operation.guid === localStorage['iago_op_guid'])
				plugin.iago.operation = operation;
		});

		if(plugin.iago.user.operations.length == 1) {
			plugin.iago.operation = plugin.iago.user.operations[0].operation;
			localStorage['iago_op_guid'] = plugin.iago.operation.guid;
			select.prop('selectedIndex', 1);
		}

		container.append($('<p>')
			.append(select)
			.append('<a onclick="plugin.iago.checkCredentials();">Refresh operations</a>')
		);

		container.append($('<p>')
			.append('<a onclick="plugin.iago.refreshMapData();">Refresh IAGO data</a>')
			.append('<a onclick="plugin.iago.logout();">Logout</a>')
			.append($('<span>').text(plugin.iago.status))
		);

		container.append($('<p>')
			.append('Announce volatile window: ')
			.append('<a onclick="plugin.iago.volatileWindowStart();">open</a>')
			.append('<a onclick="plugin.iago.volatileWindowEnd();">closed</a>')
		);

		container.append($('<hr>'));

		if(!plugin.iago.operation) {
			container.append($('<p>Select an operation for further options.</p>'));
		} else {
			if(!window.selectedPortal) {
				container.append($('<p>Select a portal.</p>'));
			} else {
				var guid = window.selectedPortal;

				container.append($('<p>').text(window.portals[guid].options.data.title));
				var p = $('<p>').appendTo(container);

				if(plugin.iago.isPortalAdded(guid))
					p.append('<a onclick="plugin.iago.removePortal();">Remove portal from operation</a>');
				else
					p.append('<a onclick="plugin.iago.addPortal();">Add portal to operation</a>');

				if(plugin.iago.isPortalVolatile(guid))
					p.append('<a onclick="plugin.iago.removeVolatile();">Retract current portal volatility</a>');
				else
					p.append('<a onclick="plugin.iago.addVolatile();">Announce portal as volatile</a>');

				//if(plugin.iago.isPortalTarget(guid))
				//	p.append('<a onclick="plugin.iago.removeTarget();">Remove this target</a>');
				//else
				//	p.append('<a onclick="plugin.iago.addTarget();">Add as target</a>');
			}
		}
		return;
	}

	if(state == 'LOGGING_IN') {
		container.append($('<p>Please wait...</p>'))
		return;
	}

	container
		.append($('<p>Please provide a valid API token from www.iago.io</p>'))
		.append($('<p>')
			.append($('<input>')
				.prop({placeholder: 'Enter API token...', value: plugin.iago.api_token })
				.keypress(function(event) {
					if(event.keyCode == 13) {
						localStorage['iago_api_token'] = plugin.iago.api_token = $(this).val();
						plugin.iago.checkCredentials();
					}
				}))
			.append($('<input>')
				.prop({ type: 'button', value: 'Login...' })
				.click(function(event) {
					localStorage['iago_api_token'] = plugin.iago.api_token = $(this).prev().val();
					plugin.iago.checkCredentials();
				})));

	if(state == 'MUST_LOGIN')
		return;

	if(state == 'MUST_REGISTER')
		container.append($('<p>Your IAGO account needs approval. Please install the app and meet with a trusted user.</p>'));
	else
		container.append($('<p>Unknown IAGO account state.</p>'));
}

plugin.iago.volatileWindowStart = function() {
	if(!plugin.iago.operation) {
		alert('Select an operation first!');
		return;
	}
	if(!confirm('This will trigger a permanent notification for all agents that cannot be dismissed!\n\nAre sure you want to continue?'))
		return;
	var params = {
		operation: plugin.iago.operation.guid
	};
	window.plugin.iago.rpc('volatileWindow/start', params, function(r) {});
};

plugin.iago.volatileWindowEnd = function() {
	if(!plugin.iago.operation) {
		alert('Select an operation first!');
		return;
	}
	if(!confirm('This will trigger a notification for all agents!\n\nAre sure you want to continue?'))
		return;
	var params = {
		operation: plugin.iago.operation.guid
	};
	window.plugin.iago.rpc('volatileWindow/end', params, function(r) {});
};

plugin.iago.addPortal = function() {
	if(!plugin.iago.operation) {
		alert('Select an operation first!');
		return;
	}
	if(!(window.selectedPortal && window.portals[window.selectedPortal])) {
		alert('Please select a portal!');
		return;
	}
	var p = window.portals[window.selectedPortal].options.data;

	var params = {
		operation: plugin.iago.operation.guid,
		portal_guid: window.selectedPortal,
		title: p.title,
		latE6: p.latE6,
		lngE6: p.lngE6,
		image_url: p.image,
	};
	plugin.iago.rpc('portal/add', params, function(r) {
		var data = plugin.iago.operationData;
		if(!data.portals) data.portals = [];
		data.portals.push(r.portal);
		plugin.iago.onOperationDataChanged();
		plugin.iago.render();
		var p = $('<p>Portal added.</p>').appendTo(plugin.iago.container);
		setTimeout(function() { plugin.iago.render(); }, 2000);
	});
}

plugin.iago.removePortal = function() {
	if(!plugin.iago.operation) {
		alert('Select an operation first!');
		return;
	}
	if(!(window.selectedPortal && window.portals[window.selectedPortal])) {
		alert('Please select a portal!');
		return;
	}
	var p = window.portals[window.selectedPortal].options.data;

	var params = {
		operation: plugin.iago.operation.guid,
		portal_guid: window.selectedPortal
	};
	plugin.iago.rpc('portal/delete', params, function(r) {
		var portals = plugin.iago.operationData.portals;
		if(portals) {
			for(var i=0;i<portals.length;i++) {
				if(portals[i].portal_guid == params.portal_guid) {
					portals.splice(i, 1);
					break;
				}
			}
		}
		plugin.iago.onOperationDataChanged();
		plugin.iago.render();
		var p = $('<p>Portal deleted.</p>').appendTo(plugin.iago.container);
		setTimeout(function() { plugin.iago.render(); }, 2000);
	});
}

plugin.iago.addVolatile = function() {
	if(!plugin.iago.operation) {
		alert('Select an operation first!');
		return;
	}
	if(!(window.selectedPortal && window.portals[window.selectedPortal])) {
		alert('Please select a portal!');
		return;
	}
	var p = window.portals[window.selectedPortal].options.data;

	var params = {
		operation: plugin.iago.operation.guid,
		portal_guid: window.selectedPortal,
		title: p.title,
		latE6: p.latE6,
		lngE6: p.lngE6,
		image_url: p.image,
	};
	plugin.iago.rpc('volatile/announce', params, function(r) {
		var data = plugin.iago.operationData;
		if(!data.volatiles) data.volatiles = [];
		data.volatiles.push(r.volatile);
		plugin.iago.onOperationDataChanged();
		plugin.iago.render();
		var p = $('<p>Volatile portal added.</p>').appendTo(plugin.iago.container);
		setTimeout(function() { plugin.iago.render(); }, 2000);
	});
}

plugin.iago.removeVolatile = function() {
	if(!plugin.iago.operation) {
		alert('Select an operation first!');
		return;
	}
	if(!(window.selectedPortal && window.portals[window.selectedPortal])) {
		alert('Please select a portal!');
		return;
	}
	var p = window.portals[window.selectedPortal].options.data;

	var params = {
		operation: plugin.iago.operation.guid,
		portal_guid: window.selectedPortal
	};
	plugin.iago.rpc('volatile/retract', params, function(r) {
		var volatiles = plugin.iago.operationData.volatiles;
		if(volatiles) {
			for(var i=0;i<volatiles.length;i++) {
				if(volatiles[i].portal_guid == params.portal_guid) {
					volatiles.splice(i, 1);
					break;
				}
			}
		}
		plugin.iago.onOperationDataChanged();
		plugin.iago.render();
		var p = $('<p>Volatile portal deleted.</p>').appendTo(plugin.iago.container);
		setTimeout(function() { plugin.iago.render(); }, 2000);
	});
}

plugin.iago.addTarget = plugin.iago.removeTarget = function() {
	alert('Not implemented yet!'); // TODO
}

plugin.iago.onOperationChanged = function() {
	plugin.iago.layerClusters.clearLayers();
	plugin.iago.layerGeometries.clearLayers();
	plugin.iago.layerLocations.clearLayers();
	plugin.iago.layerPortals.clearLayers();
	plugin.iago.layerTargets.clearLayers();
	plugin.iago.layerVolatiles.clearLayers();

	plugin.iago.operationData = null;
	plugin.iago.onOperationDataChanged();

	clusterTimestamp = 0;
	geometryTimestamp = 0;
	locationTimestamp = 0;
	portalTimestamp = 0;
	targetTimestamp = 0;
	volatileTimestamp = 0;
	waypointTimestamp = 0;

	plugin.iago.render();
	if(plugin.iago.operation) {
		setTimeout(function() {
			plugin.iago.refreshMapData();
		}, 250);
	}
};

plugin.iago.onPaneChanged = function(pane) {
	if(pane == 'plugin-iago')
		plugin.iago.showDialog();
	else
		plugin.iago.container.remove();
}

plugin.iago.showDialog = function(){
	if(window.useAndroidPanes()) {
		plugin.iago.container
			.addClass('mobile')
			.appendTo(document.body);
	} else {
		localStorage.iago_visible = true;
		dialog({
			html: plugin.iago.container,
			title: 'IAGO',
			id: 'plugin-iago',
			width: 350,
			position: {my: 'right-20 top', at: 'left top', of: $('.leaflet-control-layers-toggle', map.getContainer())},
			closeCallback: function() { localStorage.iago_visible = false; }
		});
	}
}

plugin.iago.onResume = function() {
	plugin.iago.refreshMapData();
}

plugin.iago.findUserPosition = function(nick) {
	if(!(plugin.iago.operationData && plugin.iago.operationData.locations))
		return plugin.iago.findUserPositionOriginal.apply(this, arguments);

	nick = nick.toLowerCase();
	var dataPlayerTracker = undefined;
	$.each(plugin.playerTracker.stored, function(nickname, playerData) {
		if(nickname.toLowerCase() === nick) {
			var events = playerData.events;
			var last = events[events.length-1];
			dataPlayerTracker = {
				time: last.time,
				pos: plugin.playerTracker.getLatLngFromEvent(last)
			};
			return false;
		}
	});

	var dataIAGO = undefined;
	plugin.iago.operationData.locations.forEach(function(loc) {
		if (loc.user.nickname.toLowerCase() == nick) {
			dataIAGO = {
				time: loc.loc.recorded_ms,
				pos: latLngFromE6(loc.loc)
			};
		}
	});

	if(dataIAGO && dataPlayerTracker && dataIAGO.time >= dataPlayerTracker.time) {
		return dataIAGO.pos;
	} else if(dataPlayerTracker) {
		return dataPlayerTracker.pos;
	} else if(dataIAGO) {
		return dataIAGO.pos;
	} else {
		return plugin.iago.findUserPositionOriginal.apply(this, arguments);
	}
}

var setup = function() {
	//! moment.js
//! version : 2.5.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com
(function(a){function b(){return{empty:!1,unusedTokens:[],unusedInput:[],overflow:-2,charsLeftOver:0,nullInput:!1,invalidMonth:null,invalidFormat:!1,userInvalidated:!1,iso:!1}}function c(a,b){return function(c){return k(a.call(this,c),b)}}function d(a,b){return function(c){return this.lang().ordinal(a.call(this,c),b)}}function e(){}function f(a){w(a),h(this,a)}function g(a){var b=q(a),c=b.year||0,d=b.month||0,e=b.week||0,f=b.day||0,g=b.hour||0,h=b.minute||0,i=b.second||0,j=b.millisecond||0;this._milliseconds=+j+1e3*i+6e4*h+36e5*g,this._days=+f+7*e,this._months=+d+12*c,this._data={},this._bubble()}function h(a,b){for(var c in b)b.hasOwnProperty(c)&&(a[c]=b[c]);return b.hasOwnProperty("toString")&&(a.toString=b.toString),b.hasOwnProperty("valueOf")&&(a.valueOf=b.valueOf),a}function i(a){var b,c={};for(b in a)a.hasOwnProperty(b)&&qb.hasOwnProperty(b)&&(c[b]=a[b]);return c}function j(a){return 0>a?Math.ceil(a):Math.floor(a)}function k(a,b,c){for(var d=""+Math.abs(a),e=a>=0;d.length<b;)d="0"+d;return(e?c?"+":"":"-")+d}function l(a,b,c,d){var e,f,g=b._milliseconds,h=b._days,i=b._months;g&&a._d.setTime(+a._d+g*c),(h||i)&&(e=a.minute(),f=a.hour()),h&&a.date(a.date()+h*c),i&&a.month(a.month()+i*c),g&&!d&&db.updateOffset(a),(h||i)&&(a.minute(e),a.hour(f))}function m(a){return"[object Array]"===Object.prototype.toString.call(a)}function n(a){return"[object Date]"===Object.prototype.toString.call(a)||a instanceof Date}function o(a,b,c){var d,e=Math.min(a.length,b.length),f=Math.abs(a.length-b.length),g=0;for(d=0;e>d;d++)(c&&a[d]!==b[d]||!c&&s(a[d])!==s(b[d]))&&g++;return g+f}function p(a){if(a){var b=a.toLowerCase().replace(/(.)s$/,"$1");a=Tb[a]||Ub[b]||b}return a}function q(a){var b,c,d={};for(c in a)a.hasOwnProperty(c)&&(b=p(c),b&&(d[b]=a[c]));return d}function r(b){var c,d;if(0===b.indexOf("week"))c=7,d="day";else{if(0!==b.indexOf("month"))return;c=12,d="month"}db[b]=function(e,f){var g,h,i=db.fn._lang[b],j=[];if("number"==typeof e&&(f=e,e=a),h=function(a){var b=db().utc().set(d,a);return i.call(db.fn._lang,b,e||"")},null!=f)return h(f);for(g=0;c>g;g++)j.push(h(g));return j}}function s(a){var b=+a,c=0;return 0!==b&&isFinite(b)&&(c=b>=0?Math.floor(b):Math.ceil(b)),c}function t(a,b){return new Date(Date.UTC(a,b+1,0)).getUTCDate()}function u(a){return v(a)?366:365}function v(a){return a%4===0&&a%100!==0||a%400===0}function w(a){var b;a._a&&-2===a._pf.overflow&&(b=a._a[jb]<0||a._a[jb]>11?jb:a._a[kb]<1||a._a[kb]>t(a._a[ib],a._a[jb])?kb:a._a[lb]<0||a._a[lb]>23?lb:a._a[mb]<0||a._a[mb]>59?mb:a._a[nb]<0||a._a[nb]>59?nb:a._a[ob]<0||a._a[ob]>999?ob:-1,a._pf._overflowDayOfYear&&(ib>b||b>kb)&&(b=kb),a._pf.overflow=b)}function x(a){return null==a._isValid&&(a._isValid=!isNaN(a._d.getTime())&&a._pf.overflow<0&&!a._pf.empty&&!a._pf.invalidMonth&&!a._pf.nullInput&&!a._pf.invalidFormat&&!a._pf.userInvalidated,a._strict&&(a._isValid=a._isValid&&0===a._pf.charsLeftOver&&0===a._pf.unusedTokens.length)),a._isValid}function y(a){return a?a.toLowerCase().replace("_","-"):a}function z(a,b){return b._isUTC?db(a).zone(b._offset||0):db(a).local()}function A(a,b){return b.abbr=a,pb[a]||(pb[a]=new e),pb[a].set(b),pb[a]}function B(a){delete pb[a]}function C(a){var b,c,d,e,f=0,g=function(a){if(!pb[a]&&rb)try{require("./lang/"+a)}catch(b){}return pb[a]};if(!a)return db.fn._lang;if(!m(a)){if(c=g(a))return c;a=[a]}for(;f<a.length;){for(e=y(a[f]).split("-"),b=e.length,d=y(a[f+1]),d=d?d.split("-"):null;b>0;){if(c=g(e.slice(0,b).join("-")))return c;if(d&&d.length>=b&&o(e,d,!0)>=b-1)break;b--}f++}return db.fn._lang}function D(a){return a.match(/\[[\s\S]/)?a.replace(/^\[|\]$/g,""):a.replace(/\\/g,"")}function E(a){var b,c,d=a.match(vb);for(b=0,c=d.length;c>b;b++)d[b]=Yb[d[b]]?Yb[d[b]]:D(d[b]);return function(e){var f="";for(b=0;c>b;b++)f+=d[b]instanceof Function?d[b].call(e,a):d[b];return f}}function F(a,b){return a.isValid()?(b=G(b,a.lang()),Vb[b]||(Vb[b]=E(b)),Vb[b](a)):a.lang().invalidDate()}function G(a,b){function c(a){return b.longDateFormat(a)||a}var d=5;for(wb.lastIndex=0;d>=0&&wb.test(a);)a=a.replace(wb,c),wb.lastIndex=0,d-=1;return a}function H(a,b){var c,d=b._strict;switch(a){case"DDDD":return Ib;case"YYYY":case"GGGG":case"gggg":return d?Jb:zb;case"Y":case"G":case"g":return Lb;case"YYYYYY":case"YYYYY":case"GGGGG":case"ggggg":return d?Kb:Ab;case"S":if(d)return Gb;case"SS":if(d)return Hb;case"SSS":if(d)return Ib;case"DDD":return yb;case"MMM":case"MMMM":case"dd":case"ddd":case"dddd":return Cb;case"a":case"A":return C(b._l)._meridiemParse;case"X":return Fb;case"Z":case"ZZ":return Db;case"T":return Eb;case"SSSS":return Bb;case"MM":case"DD":case"YY":case"GG":case"gg":case"HH":case"hh":case"mm":case"ss":case"ww":case"WW":return d?Hb:xb;case"M":case"D":case"d":case"H":case"h":case"m":case"s":case"w":case"W":case"e":case"E":return xb;default:return c=new RegExp(P(O(a.replace("\\","")),"i"))}}function I(a){a=a||"";var b=a.match(Db)||[],c=b[b.length-1]||[],d=(c+"").match(Qb)||["-",0,0],e=+(60*d[1])+s(d[2]);return"+"===d[0]?-e:e}function J(a,b,c){var d,e=c._a;switch(a){case"M":case"MM":null!=b&&(e[jb]=s(b)-1);break;case"MMM":case"MMMM":d=C(c._l).monthsParse(b),null!=d?e[jb]=d:c._pf.invalidMonth=b;break;case"D":case"DD":null!=b&&(e[kb]=s(b));break;case"DDD":case"DDDD":null!=b&&(c._dayOfYear=s(b));break;case"YY":e[ib]=s(b)+(s(b)>68?1900:2e3);break;case"YYYY":case"YYYYY":case"YYYYYY":e[ib]=s(b);break;case"a":case"A":c._isPm=C(c._l).isPM(b);break;case"H":case"HH":case"h":case"hh":e[lb]=s(b);break;case"m":case"mm":e[mb]=s(b);break;case"s":case"ss":e[nb]=s(b);break;case"S":case"SS":case"SSS":case"SSSS":e[ob]=s(1e3*("0."+b));break;case"X":c._d=new Date(1e3*parseFloat(b));break;case"Z":case"ZZ":c._useUTC=!0,c._tzm=I(b);break;case"w":case"ww":case"W":case"WW":case"d":case"dd":case"ddd":case"dddd":case"e":case"E":a=a.substr(0,1);case"gg":case"gggg":case"GG":case"GGGG":case"GGGGG":a=a.substr(0,2),b&&(c._w=c._w||{},c._w[a]=b)}}function K(a){var b,c,d,e,f,g,h,i,j,k,l=[];if(!a._d){for(d=M(a),a._w&&null==a._a[kb]&&null==a._a[jb]&&(f=function(b){var c=parseInt(b,10);return b?b.length<3?c>68?1900+c:2e3+c:c:null==a._a[ib]?db().weekYear():a._a[ib]},g=a._w,null!=g.GG||null!=g.W||null!=g.E?h=Z(f(g.GG),g.W||1,g.E,4,1):(i=C(a._l),j=null!=g.d?V(g.d,i):null!=g.e?parseInt(g.e,10)+i._week.dow:0,k=parseInt(g.w,10)||1,null!=g.d&&j<i._week.dow&&k++,h=Z(f(g.gg),k,j,i._week.doy,i._week.dow)),a._a[ib]=h.year,a._dayOfYear=h.dayOfYear),a._dayOfYear&&(e=null==a._a[ib]?d[ib]:a._a[ib],a._dayOfYear>u(e)&&(a._pf._overflowDayOfYear=!0),c=U(e,0,a._dayOfYear),a._a[jb]=c.getUTCMonth(),a._a[kb]=c.getUTCDate()),b=0;3>b&&null==a._a[b];++b)a._a[b]=l[b]=d[b];for(;7>b;b++)a._a[b]=l[b]=null==a._a[b]?2===b?1:0:a._a[b];l[lb]+=s((a._tzm||0)/60),l[mb]+=s((a._tzm||0)%60),a._d=(a._useUTC?U:T).apply(null,l)}}function L(a){var b;a._d||(b=q(a._i),a._a=[b.year,b.month,b.day,b.hour,b.minute,b.second,b.millisecond],K(a))}function M(a){var b=new Date;return a._useUTC?[b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()]:[b.getFullYear(),b.getMonth(),b.getDate()]}function N(a){a._a=[],a._pf.empty=!0;var b,c,d,e,f,g=C(a._l),h=""+a._i,i=h.length,j=0;for(d=G(a._f,g).match(vb)||[],b=0;b<d.length;b++)e=d[b],c=(h.match(H(e,a))||[])[0],c&&(f=h.substr(0,h.indexOf(c)),f.length>0&&a._pf.unusedInput.push(f),h=h.slice(h.indexOf(c)+c.length),j+=c.length),Yb[e]?(c?a._pf.empty=!1:a._pf.unusedTokens.push(e),J(e,c,a)):a._strict&&!c&&a._pf.unusedTokens.push(e);a._pf.charsLeftOver=i-j,h.length>0&&a._pf.unusedInput.push(h),a._isPm&&a._a[lb]<12&&(a._a[lb]+=12),a._isPm===!1&&12===a._a[lb]&&(a._a[lb]=0),K(a),w(a)}function O(a){return a.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g,function(a,b,c,d,e){return b||c||d||e})}function P(a){return a.replace(/[-\/\\^$*+?.()|[\]{}]/g,"\\$&")}function Q(a){var c,d,e,f,g;if(0===a._f.length)return a._pf.invalidFormat=!0,a._d=new Date(0/0),void 0;for(f=0;f<a._f.length;f++)g=0,c=h({},a),c._pf=b(),c._f=a._f[f],N(c),x(c)&&(g+=c._pf.charsLeftOver,g+=10*c._pf.unusedTokens.length,c._pf.score=g,(null==e||e>g)&&(e=g,d=c));h(a,d||c)}function R(a){var b,c,d=a._i,e=Mb.exec(d);if(e){for(a._pf.iso=!0,b=0,c=Ob.length;c>b;b++)if(Ob[b][1].exec(d)){a._f=Ob[b][0]+(e[6]||" ");break}for(b=0,c=Pb.length;c>b;b++)if(Pb[b][1].exec(d)){a._f+=Pb[b][0];break}d.match(Db)&&(a._f+="Z"),N(a)}else a._d=new Date(d)}function S(b){var c=b._i,d=sb.exec(c);c===a?b._d=new Date:d?b._d=new Date(+d[1]):"string"==typeof c?R(b):m(c)?(b._a=c.slice(0),K(b)):n(c)?b._d=new Date(+c):"object"==typeof c?L(b):b._d=new Date(c)}function T(a,b,c,d,e,f,g){var h=new Date(a,b,c,d,e,f,g);return 1970>a&&h.setFullYear(a),h}function U(a){var b=new Date(Date.UTC.apply(null,arguments));return 1970>a&&b.setUTCFullYear(a),b}function V(a,b){if("string"==typeof a)if(isNaN(a)){if(a=b.weekdaysParse(a),"number"!=typeof a)return null}else a=parseInt(a,10);return a}function W(a,b,c,d,e){return e.relativeTime(b||1,!!c,a,d)}function X(a,b,c){var d=hb(Math.abs(a)/1e3),e=hb(d/60),f=hb(e/60),g=hb(f/24),h=hb(g/365),i=45>d&&["s",d]||1===e&&["m"]||45>e&&["mm",e]||1===f&&["h"]||22>f&&["hh",f]||1===g&&["d"]||25>=g&&["dd",g]||45>=g&&["M"]||345>g&&["MM",hb(g/30)]||1===h&&["y"]||["yy",h];return i[2]=b,i[3]=a>0,i[4]=c,W.apply({},i)}function Y(a,b,c){var d,e=c-b,f=c-a.day();return f>e&&(f-=7),e-7>f&&(f+=7),d=db(a).add("d",f),{week:Math.ceil(d.dayOfYear()/7),year:d.year()}}function Z(a,b,c,d,e){var f,g,h=U(a,0,1).getUTCDay();return c=null!=c?c:e,f=e-h+(h>d?7:0)-(e>h?7:0),g=7*(b-1)+(c-e)+f+1,{year:g>0?a:a-1,dayOfYear:g>0?g:u(a-1)+g}}function $(a){var b=a._i,c=a._f;return null===b?db.invalid({nullInput:!0}):("string"==typeof b&&(a._i=b=C().preparse(b)),db.isMoment(b)?(a=i(b),a._d=new Date(+b._d)):c?m(c)?Q(a):N(a):S(a),new f(a))}function _(a,b){db.fn[a]=db.fn[a+"s"]=function(a){var c=this._isUTC?"UTC":"";return null!=a?(this._d["set"+c+b](a),db.updateOffset(this),this):this._d["get"+c+b]()}}function ab(a){db.duration.fn[a]=function(){return this._data[a]}}function bb(a,b){db.duration.fn["as"+a]=function(){return+this/b}}function cb(a){var b=!1,c=db;"undefined"==typeof ender&&(a?(gb.moment=function(){return!b&&console&&console.warn&&(b=!0,console.warn("Accessing Moment through the global scope is deprecated, and will be removed in an upcoming release.")),c.apply(null,arguments)},h(gb.moment,c)):gb.moment=db)}for(var db,eb,fb="2.5.1",gb=this,hb=Math.round,ib=0,jb=1,kb=2,lb=3,mb=4,nb=5,ob=6,pb={},qb={_isAMomentObject:null,_i:null,_f:null,_l:null,_strict:null,_isUTC:null,_offset:null,_pf:null,_lang:null},rb="undefined"!=typeof module&&module.exports&&"undefined"!=typeof require,sb=/^\/?Date\((\-?\d+)/i,tb=/(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,ub=/^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,vb=/(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|X|zz?|ZZ?|.)/g,wb=/(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,xb=/\d\d?/,yb=/\d{1,3}/,zb=/\d{1,4}/,Ab=/[+\-]?\d{1,6}/,Bb=/\d+/,Cb=/[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i,Db=/Z|[\+\-]\d\d:?\d\d/gi,Eb=/T/i,Fb=/[\+\-]?\d+(\.\d{1,3})?/,Gb=/\d/,Hb=/\d\d/,Ib=/\d{3}/,Jb=/\d{4}/,Kb=/[+-]?\d{6}/,Lb=/[+-]?\d+/,Mb=/^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,Nb="YYYY-MM-DDTHH:mm:ssZ",Ob=[["YYYYYY-MM-DD",/[+-]\d{6}-\d{2}-\d{2}/],["YYYY-MM-DD",/\d{4}-\d{2}-\d{2}/],["GGGG-[W]WW-E",/\d{4}-W\d{2}-\d/],["GGGG-[W]WW",/\d{4}-W\d{2}/],["YYYY-DDD",/\d{4}-\d{3}/]],Pb=[["HH:mm:ss.SSSS",/(T| )\d\d:\d\d:\d\d\.\d{1,3}/],["HH:mm:ss",/(T| )\d\d:\d\d:\d\d/],["HH:mm",/(T| )\d\d:\d\d/],["HH",/(T| )\d\d/]],Qb=/([\+\-]|\d\d)/gi,Rb="Date|Hours|Minutes|Seconds|Milliseconds".split("|"),Sb={Milliseconds:1,Seconds:1e3,Minutes:6e4,Hours:36e5,Days:864e5,Months:2592e6,Years:31536e6},Tb={ms:"millisecond",s:"second",m:"minute",h:"hour",d:"day",D:"date",w:"week",W:"isoWeek",M:"month",y:"year",DDD:"dayOfYear",e:"weekday",E:"isoWeekday",gg:"weekYear",GG:"isoWeekYear"},Ub={dayofyear:"dayOfYear",isoweekday:"isoWeekday",isoweek:"isoWeek",weekyear:"weekYear",isoweekyear:"isoWeekYear"},Vb={},Wb="DDD w W M D d".split(" "),Xb="M D H h m s w W".split(" "),Yb={M:function(){return this.month()+1},MMM:function(a){return this.lang().monthsShort(this,a)},MMMM:function(a){return this.lang().months(this,a)},D:function(){return this.date()},DDD:function(){return this.dayOfYear()},d:function(){return this.day()},dd:function(a){return this.lang().weekdaysMin(this,a)},ddd:function(a){return this.lang().weekdaysShort(this,a)},dddd:function(a){return this.lang().weekdays(this,a)},w:function(){return this.week()},W:function(){return this.isoWeek()},YY:function(){return k(this.year()%100,2)},YYYY:function(){return k(this.year(),4)},YYYYY:function(){return k(this.year(),5)},YYYYYY:function(){var a=this.year(),b=a>=0?"+":"-";return b+k(Math.abs(a),6)},gg:function(){return k(this.weekYear()%100,2)},gggg:function(){return k(this.weekYear(),4)},ggggg:function(){return k(this.weekYear(),5)},GG:function(){return k(this.isoWeekYear()%100,2)},GGGG:function(){return k(this.isoWeekYear(),4)},GGGGG:function(){return k(this.isoWeekYear(),5)},e:function(){return this.weekday()},E:function(){return this.isoWeekday()},a:function(){return this.lang().meridiem(this.hours(),this.minutes(),!0)},A:function(){return this.lang().meridiem(this.hours(),this.minutes(),!1)},H:function(){return this.hours()},h:function(){return this.hours()%12||12},m:function(){return this.minutes()},s:function(){return this.seconds()},S:function(){return s(this.milliseconds()/100)},SS:function(){return k(s(this.milliseconds()/10),2)},SSS:function(){return k(this.milliseconds(),3)},SSSS:function(){return k(this.milliseconds(),3)},Z:function(){var a=-this.zone(),b="+";return 0>a&&(a=-a,b="-"),b+k(s(a/60),2)+":"+k(s(a)%60,2)},ZZ:function(){var a=-this.zone(),b="+";return 0>a&&(a=-a,b="-"),b+k(s(a/60),2)+k(s(a)%60,2)},z:function(){return this.zoneAbbr()},zz:function(){return this.zoneName()},X:function(){return this.unix()},Q:function(){return this.quarter()}},Zb=["months","monthsShort","weekdays","weekdaysShort","weekdaysMin"];Wb.length;)eb=Wb.pop(),Yb[eb+"o"]=d(Yb[eb],eb);for(;Xb.length;)eb=Xb.pop(),Yb[eb+eb]=c(Yb[eb],2);for(Yb.DDDD=c(Yb.DDD,3),h(e.prototype,{set:function(a){var b,c;for(c in a)b=a[c],"function"==typeof b?this[c]=b:this["_"+c]=b},_months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_"),months:function(a){return this._months[a.month()]},_monthsShort:"Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),monthsShort:function(a){return this._monthsShort[a.month()]},monthsParse:function(a){var b,c,d;for(this._monthsParse||(this._monthsParse=[]),b=0;12>b;b++)if(this._monthsParse[b]||(c=db.utc([2e3,b]),d="^"+this.months(c,"")+"|^"+this.monthsShort(c,""),this._monthsParse[b]=new RegExp(d.replace(".",""),"i")),this._monthsParse[b].test(a))return b},_weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),weekdays:function(a){return this._weekdays[a.day()]},_weekdaysShort:"Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),weekdaysShort:function(a){return this._weekdaysShort[a.day()]},_weekdaysMin:"Su_Mo_Tu_We_Th_Fr_Sa".split("_"),weekdaysMin:function(a){return this._weekdaysMin[a.day()]},weekdaysParse:function(a){var b,c,d;for(this._weekdaysParse||(this._weekdaysParse=[]),b=0;7>b;b++)if(this._weekdaysParse[b]||(c=db([2e3,1]).day(b),d="^"+this.weekdays(c,"")+"|^"+this.weekdaysShort(c,"")+"|^"+this.weekdaysMin(c,""),this._weekdaysParse[b]=new RegExp(d.replace(".",""),"i")),this._weekdaysParse[b].test(a))return b},_longDateFormat:{LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D YYYY",LLL:"MMMM D YYYY LT",LLLL:"dddd, MMMM D YYYY LT"},longDateFormat:function(a){var b=this._longDateFormat[a];return!b&&this._longDateFormat[a.toUpperCase()]&&(b=this._longDateFormat[a.toUpperCase()].replace(/MMMM|MM|DD|dddd/g,function(a){return a.slice(1)}),this._longDateFormat[a]=b),b},isPM:function(a){return"p"===(a+"").toLowerCase().charAt(0)},_meridiemParse:/[ap]\.?m?\.?/i,meridiem:function(a,b,c){return a>11?c?"pm":"PM":c?"am":"AM"},_calendar:{sameDay:"[Today at] LT",nextDay:"[Tomorrow at] LT",nextWeek:"dddd [at] LT",lastDay:"[Yesterday at] LT",lastWeek:"[Last] dddd [at] LT",sameElse:"L"},calendar:function(a,b){var c=this._calendar[a];return"function"==typeof c?c.apply(b):c},_relativeTime:{future:"in %s",past:"%s ago",s:"a few seconds",m:"a minute",mm:"%d minutes",h:"an hour",hh:"%d hours",d:"a day",dd:"%d days",M:"a month",MM:"%d months",y:"a year",yy:"%d years"},relativeTime:function(a,b,c,d){var e=this._relativeTime[c];return"function"==typeof e?e(a,b,c,d):e.replace(/%d/i,a)},pastFuture:function(a,b){var c=this._relativeTime[a>0?"future":"past"];return"function"==typeof c?c(b):c.replace(/%s/i,b)},ordinal:function(a){return this._ordinal.replace("%d",a)},_ordinal:"%d",preparse:function(a){return a},postformat:function(a){return a},week:function(a){return Y(a,this._week.dow,this._week.doy).week},_week:{dow:0,doy:6},_invalidDate:"Invalid date",invalidDate:function(){return this._invalidDate}}),db=function(c,d,e,f){var g;return"boolean"==typeof e&&(f=e,e=a),g={},g._isAMomentObject=!0,g._i=c,g._f=d,g._l=e,g._strict=f,g._isUTC=!1,g._pf=b(),$(g)},db.utc=function(c,d,e,f){var g;return"boolean"==typeof e&&(f=e,e=a),g={},g._isAMomentObject=!0,g._useUTC=!0,g._isUTC=!0,g._l=e,g._i=c,g._f=d,g._strict=f,g._pf=b(),$(g).utc()},db.unix=function(a){return db(1e3*a)},db.duration=function(a,b){var c,d,e,f=a,h=null;return db.isDuration(a)?f={ms:a._milliseconds,d:a._days,M:a._months}:"number"==typeof a?(f={},b?f[b]=a:f.milliseconds=a):(h=tb.exec(a))?(c="-"===h[1]?-1:1,f={y:0,d:s(h[kb])*c,h:s(h[lb])*c,m:s(h[mb])*c,s:s(h[nb])*c,ms:s(h[ob])*c}):(h=ub.exec(a))&&(c="-"===h[1]?-1:1,e=function(a){var b=a&&parseFloat(a.replace(",","."));return(isNaN(b)?0:b)*c},f={y:e(h[2]),M:e(h[3]),d:e(h[4]),h:e(h[5]),m:e(h[6]),s:e(h[7]),w:e(h[8])}),d=new g(f),db.isDuration(a)&&a.hasOwnProperty("_lang")&&(d._lang=a._lang),d},db.version=fb,db.defaultFormat=Nb,db.updateOffset=function(){},db.lang=function(a,b){var c;return a?(b?A(y(a),b):null===b?(B(a),a="en"):pb[a]||C(a),c=db.duration.fn._lang=db.fn._lang=C(a),c._abbr):db.fn._lang._abbr},db.langData=function(a){return a&&a._lang&&a._lang._abbr&&(a=a._lang._abbr),C(a)},db.isMoment=function(a){return a instanceof f||null!=a&&a.hasOwnProperty("_isAMomentObject")},db.isDuration=function(a){return a instanceof g},eb=Zb.length-1;eb>=0;--eb)r(Zb[eb]);for(db.normalizeUnits=function(a){return p(a)},db.invalid=function(a){var b=db.utc(0/0);return null!=a?h(b._pf,a):b._pf.userInvalidated=!0,b},db.parseZone=function(a){return db(a).parseZone()},h(db.fn=f.prototype,{clone:function(){return db(this)},valueOf:function(){return+this._d+6e4*(this._offset||0)},unix:function(){return Math.floor(+this/1e3)},toString:function(){return this.clone().lang("en").format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ")},toDate:function(){return this._offset?new Date(+this):this._d},toISOString:function(){var a=db(this).utc();return 0<a.year()&&a.year()<=9999?F(a,"YYYY-MM-DD[T]HH:mm:ss.SSS[Z]"):F(a,"YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]")},toArray:function(){var a=this;return[a.year(),a.month(),a.date(),a.hours(),a.minutes(),a.seconds(),a.milliseconds()]},isValid:function(){return x(this)},isDSTShifted:function(){return this._a?this.isValid()&&o(this._a,(this._isUTC?db.utc(this._a):db(this._a)).toArray())>0:!1},parsingFlags:function(){return h({},this._pf)},invalidAt:function(){return this._pf.overflow},utc:function(){return this.zone(0)},local:function(){return this.zone(0),this._isUTC=!1,this},format:function(a){var b=F(this,a||db.defaultFormat);return this.lang().postformat(b)},add:function(a,b){var c;return c="string"==typeof a?db.duration(+b,a):db.duration(a,b),l(this,c,1),this},subtract:function(a,b){var c;return c="string"==typeof a?db.duration(+b,a):db.duration(a,b),l(this,c,-1),this},diff:function(a,b,c){var d,e,f=z(a,this),g=6e4*(this.zone()-f.zone());return b=p(b),"year"===b||"month"===b?(d=432e5*(this.daysInMonth()+f.daysInMonth()),e=12*(this.year()-f.year())+(this.month()-f.month()),e+=(this-db(this).startOf("month")-(f-db(f).startOf("month")))/d,e-=6e4*(this.zone()-db(this).startOf("month").zone()-(f.zone()-db(f).startOf("month").zone()))/d,"year"===b&&(e/=12)):(d=this-f,e="second"===b?d/1e3:"minute"===b?d/6e4:"hour"===b?d/36e5:"day"===b?(d-g)/864e5:"week"===b?(d-g)/6048e5:d),c?e:j(e)},from:function(a,b){return db.duration(this.diff(a)).lang(this.lang()._abbr).humanize(!b)},fromNow:function(a){return this.from(db(),a)},calendar:function(){var a=z(db(),this).startOf("day"),b=this.diff(a,"days",!0),c=-6>b?"sameElse":-1>b?"lastWeek":0>b?"lastDay":1>b?"sameDay":2>b?"nextDay":7>b?"nextWeek":"sameElse";return this.format(this.lang().calendar(c,this))},isLeapYear:function(){return v(this.year())},isDST:function(){return this.zone()<this.clone().month(0).zone()||this.zone()<this.clone().month(5).zone()},day:function(a){var b=this._isUTC?this._d.getUTCDay():this._d.getDay();return null!=a?(a=V(a,this.lang()),this.add({d:a-b})):b},month:function(a){var b,c=this._isUTC?"UTC":"";return null!=a?"string"==typeof a&&(a=this.lang().monthsParse(a),"number"!=typeof a)?this:(b=this.date(),this.date(1),this._d["set"+c+"Month"](a),this.date(Math.min(b,this.daysInMonth())),db.updateOffset(this),this):this._d["get"+c+"Month"]()},startOf:function(a){switch(a=p(a)){case"year":this.month(0);case"month":this.date(1);case"week":case"isoWeek":case"day":this.hours(0);case"hour":this.minutes(0);case"minute":this.seconds(0);case"second":this.milliseconds(0)}return"week"===a?this.weekday(0):"isoWeek"===a&&this.isoWeekday(1),this},endOf:function(a){return a=p(a),this.startOf(a).add("isoWeek"===a?"week":a,1).subtract("ms",1)},isAfter:function(a,b){return b="undefined"!=typeof b?b:"millisecond",+this.clone().startOf(b)>+db(a).startOf(b)},isBefore:function(a,b){return b="undefined"!=typeof b?b:"millisecond",+this.clone().startOf(b)<+db(a).startOf(b)},isSame:function(a,b){return b=b||"ms",+this.clone().startOf(b)===+z(a,this).startOf(b)},min:function(a){return a=db.apply(null,arguments),this>a?this:a},max:function(a){return a=db.apply(null,arguments),a>this?this:a},zone:function(a){var b=this._offset||0;return null==a?this._isUTC?b:this._d.getTimezoneOffset():("string"==typeof a&&(a=I(a)),Math.abs(a)<16&&(a=60*a),this._offset=a,this._isUTC=!0,b!==a&&l(this,db.duration(b-a,"m"),1,!0),this)},zoneAbbr:function(){return this._isUTC?"UTC":""},zoneName:function(){return this._isUTC?"Coordinated Universal Time":""},parseZone:function(){return this._tzm?this.zone(this._tzm):"string"==typeof this._i&&this.zone(this._i),this},hasAlignedHourOffset:function(a){return a=a?db(a).zone():0,(this.zone()-a)%60===0},daysInMonth:function(){return t(this.year(),this.month())},dayOfYear:function(a){var b=hb((db(this).startOf("day")-db(this).startOf("year"))/864e5)+1;return null==a?b:this.add("d",a-b)},quarter:function(){return Math.ceil((this.month()+1)/3)},weekYear:function(a){var b=Y(this,this.lang()._week.dow,this.lang()._week.doy).year;return null==a?b:this.add("y",a-b)},isoWeekYear:function(a){var b=Y(this,1,4).year;return null==a?b:this.add("y",a-b)},week:function(a){var b=this.lang().week(this);return null==a?b:this.add("d",7*(a-b))},isoWeek:function(a){var b=Y(this,1,4).week;return null==a?b:this.add("d",7*(a-b))},weekday:function(a){var b=(this.day()+7-this.lang()._week.dow)%7;return null==a?b:this.add("d",a-b)},isoWeekday:function(a){return null==a?this.day()||7:this.day(this.day()%7?a:a-7)},get:function(a){return a=p(a),this[a]()},set:function(a,b){return a=p(a),"function"==typeof this[a]&&this[a](b),this},lang:function(b){return b===a?this._lang:(this._lang=C(b),this)}}),eb=0;eb<Rb.length;eb++)_(Rb[eb].toLowerCase().replace(/s$/,""),Rb[eb]);_("year","FullYear"),db.fn.days=db.fn.day,db.fn.months=db.fn.month,db.fn.weeks=db.fn.week,db.fn.isoWeeks=db.fn.isoWeek,db.fn.toJSON=db.fn.toISOString,h(db.duration.fn=g.prototype,{_bubble:function(){var a,b,c,d,e=this._milliseconds,f=this._days,g=this._months,h=this._data;h.milliseconds=e%1e3,a=j(e/1e3),h.seconds=a%60,b=j(a/60),h.minutes=b%60,c=j(b/60),h.hours=c%24,f+=j(c/24),h.days=f%30,g+=j(f/30),h.months=g%12,d=j(g/12),h.years=d},weeks:function(){return j(this.days()/7)},valueOf:function(){return this._milliseconds+864e5*this._days+this._months%12*2592e6+31536e6*s(this._months/12)},humanize:function(a){var b=+this,c=X(b,!a,this.lang());return a&&(c=this.lang().pastFuture(b,c)),this.lang().postformat(c)},add:function(a,b){var c=db.duration(a,b);return this._milliseconds+=c._milliseconds,this._days+=c._days,this._months+=c._months,this._bubble(),this},subtract:function(a,b){var c=db.duration(a,b);return this._milliseconds-=c._milliseconds,this._days-=c._days,this._months-=c._months,this._bubble(),this},get:function(a){return a=p(a),this[a.toLowerCase()+"s"]()},as:function(a){return a=p(a),this["as"+a.charAt(0).toUpperCase()+a.slice(1)+"s"]()},lang:db.fn.lang,toIsoString:function(){var a=Math.abs(this.years()),b=Math.abs(this.months()),c=Math.abs(this.days()),d=Math.abs(this.hours()),e=Math.abs(this.minutes()),f=Math.abs(this.seconds()+this.milliseconds()/1e3);return this.asSeconds()?(this.asSeconds()<0?"-":"")+"P"+(a?a+"Y":"")+(b?b+"M":"")+(c?c+"D":"")+(d||e||f?"T":"")+(d?d+"H":"")+(e?e+"M":"")+(f?f+"S":""):"P0D"}});for(eb in Sb)Sb.hasOwnProperty(eb)&&(bb(eb,Sb[eb]),ab(eb.toLowerCase()));bb("Weeks",6048e5),db.duration.fn.asMonths=function(){return(+this-31536e6*this.years())/2592e6+12*this.years()},db.lang("en",{ordinal:function(a){var b=a%10,c=1===s(a%100/10)?"th":1===b?"st":2===b?"nd":3===b?"rd":"th";return a+c}}),rb?(module.exports=db,cb(!0)):"function"==typeof define&&define.amd?define("moment",function(b,c,d){return d.config&&d.config()&&d.config().noGlobal!==!0&&cb(d.config().noGlobal===a),db}):cb()}).call(this);

	plugin.iago.iconPlayer = L.Icon.Default.extend({options: {
		iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAANyQAADckBr7XHTAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAZgSURBVFiFnZd/jFTVFce/59733sybkYZYi25hKZDaxZZIWyvBNLE2tqTWxqRNapvG/uEfJv2jfzTWugOk+1hiB3ehMRJtxDamDWlKUCz+1VrYXTZULShKka7I7rqw7MK6PwTWnffjvnvv6R+4CzOzMzt4kpfMvHfO+dzvPeeduUPMjEaMHn30RnjeUhB9DsxTEOI8F4sTDcXWg1Brawsc52FI+RCUWgrfjyh/g+awJBGGPjxvHMbsgVIv8PbtJ64LQu3tAknyOIjaxdqvMX35KxnRvBxEcs6HweDREdi+k8oee5NA1InJyXbetStdEEIbN66C6+6lGxbd5vzwxzk0NYEdASsF2BFgIhAzyFiQYQhtgPEJ6L+/GPLFj4ZgzINcLPbVhFChcD+kfEmuu0vKu+9xdd6H9SQWMpEaOKUY5rXD2rx+2MLan/G2bfuqILR5880A+t0fPbgIq1dD+x5Y0IKAuUSW4UQK6O9H+uLfSiBq4SeeGAUAcXU54s9yzVoPLauR5jO1ATUahQUhzWeAL94K+dU7HAixey41AFBr68/Jy9wjv7Mho323epXGwi0l8KYjeBem4F0O4ZaSK/WoMJ3zIL99b4Yy2fVUKDwCAIQtW3JQasL9yUM523IrTMYpC5JxCjl1Cbrr1YgH+gWrxCPH1bRilXa++z3fLvkstO+VxygN8f4A0j27Y2i9RKBUuoP8HGjlyiqAUBri7Dmku55R9vSpvaySO+H7Wbbmdjs08Lz647MpDQxCxuVdazwHtGIFKOszhLjTgZTrRfNyslKUORIznI8jpPtfilinW7hY7Lzm8SkAv6LW1mN6/75d7i9+6Vv3M+BrclgpIJY1w7z/3joB1/0WLW322amAaAs72A8OS6PIZHZUbT4A7ujYzal62/7vZFV92BGgZct9eN7dAszr6eZbUKlEaAu+cN4gTf/BQWDngwAAlPqnPTccky53sVKAbmkCmNcJWOtTJgNQZcsyoBIL5ks1AVcshEpMVcMTgTwPsNYXcJz/2vEPQRVyrRSgpqUuMpl76yJc95u0rDlfVVNtYCfGAcc5IZAkvXzhfCpMuVx2JMTKVSBrv0EbN26YLz9t2nQXmH8gWm5DZU2FseDREQWlegWIjvLIcEyVEEEwNy6G/P4DHoTYT4XCI9Te7gEAtbc7VCj8FESvOhvuc3jJTbBO+YwjbcEjwwrWvuVAyqN2csJ3ohiUz4CvqY3xPbhr1sDN5339yss7OSz9gdraRqD15ymXt/L+B7L0pRakFS8jWQbFMezkhA+io2BmoK3tmHPo3ywjxWCuumScsndxht2hEXbeOs7u4Fn2Ls7U9o8UO4cOW7S1HWHmTwakUjvMkddDofS8tTUZB2pxHnp5E+zta6C/sAxqcR4mWz3ngCujyLzxWog47gBmp3A2u4+nL2sMD8879K7WScC6suzNrjShNHj4DLg0E2Jo6JU5CAeBgrXPmTf/k8io6tfzukwmKcyRN0Jo/RTv3WuuKgEArZ+yA6cJY2MQaW019UwoDYyOwp75QIDo+bn7sx+4s3MMRM+Y3q5ExurTqYhTmJ6uCMDvuVicqoIAAKwt2qEPGKOjEOn8TVBPBZ8bhh0ZtjBme9mza79wsTgFoh2mpyu+3trISMF0HYhg7TZ+8snLNSEAANfdbkeGDZ89i1otXaUiScFnhsDjYymy2aernlfe4CCYhrW/M90HIhk1UBuercXBEMZs5SCYWRACAMhmn+aJDxUPDkAk9bdNJil4oB88NRkjm312Pp95IRwEIbQOTE/XFTW1jsvMELGC6f5XBKV+y0EQNwwBAIThc3zpoxL3n4asoUYmKfj0KfD09DRyuT/VSlUTwjt3JtB6s+k5EIkwrj7UMUOECUz3gQhab+IgqFnA2koAIJt9gWdmLvKpvqpjj4xT2Pf6wGE4hcHBv9RLUxfCQaCRJAXTczAuU2MZIoxhDx2MoFTr7Iz6dEoAIJf7KyfJmO07idmWlrGCPXkCnCTn4ft7FkqxIISDwCJJfmM/UUPaQJQimN7uGEnyeN3jUsNKAKCzcx8bc8a+e5ydjyPYd48ztB7ijo6XGwlvCMLMjCR5zBzqVghLML09Clo/1tACscAf0yrnIHiHFi1ay9PTx3nr1q83GtfYds2aUr/myUlCmjasAgDmO2zUvdDaWrjemP8DOrPWQbvOq7UAAAAASUVORK5CYII=',
		iconRetinaUrl: 'data:image/png;base64,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'
	}});
	plugin.iago.iconCaptain = L.Icon.Default.extend({options: {
		iconUrl: 'data:image/png;base64,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',
		iconRetinaUrl: 'data:image/png;base64,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'
	}});
	plugin.iago.iconPortal = L.Icon.Default.extend({options: {
		iconUrl: 'data:image/png;base64,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',
		iconRetinaUrl: 'data:image/png;base64,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'
	}});
	plugin.iago.iconVolatile = L.Icon.Default.extend({options: {
		iconUrl: 'data:image/png;base64,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',
		iconRetinaUrl: 'data:image/png;base64,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'
	}});
	plugin.iago.iconTarget = L.Icon.Default.extend({options: {
		iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAANyQAADckBr7XHTAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAVJSURBVFiFrZdbbFR1Hsc//3POTG8W6FxABUVcC8gdN2skMZLouokaH4wuyW7WB030ZbP7IiKXmNluEBFQYyIJGzfsxeyGbOITi0RRsBp2s7hupzUCkaUgpZR2pkOnncu5/M//50PHUlumnSLf5Lz8bp/z/ed/Ln8lItSi4TYVK1vMdxTJMMKgMVy6eYtkaulVU0Gy29UScXhGOfxKfOZbTXbZnjfHhNm8MiO6QTkMKMOBMGT/3K3SNTNIm7IyUTZZjt3WuH6Riv4oEbFjSVCzgTLQADJMmM8SdGd14ZNuEV/vSsZo43kJpoUM7FR3Wjb/iCyIL5/1xP31qr4AXAIGgRygAQtoARLAzYgXZ+Tgcdfv7j9rhWyIbZGT3xsqImNX5hUeG9ipyu7J1VrMBhFZOD49xXWriHlK3K/vCTOvWV7/dp4cXzDmZGCHmqdszsSee7DZjingX5WlqVVRYB1muJ7cvg+LKpAl8W3SS8X36LpF+HPzQ0vr7VgdcHSGAAAfaMeaFXLTz1bUSZR3x2aLCAOvqqcjyeZ3Wp59tA7rMDBc4T80A8jHgAEawTxO/q8fukHfld8mtsg76tLvaHTqyMR//Uij1XweOFVpsoFfUjxyVCNq0o4Zk5JI08MPOvB3IKwEWzGFJQzuPeQqJXMdJ8qPnXmzldXcOA5QkUDp815HwSYjk9fPUjQIvNH0U0CNz5zBumkF0Xkt6Iu5nzgi3FfXmrCh+sPrBPxpTkqGJsaH2tScIMIb1+7KEFmcsPy+3L2WFWV95PZEFLJVIdenLJHb4lFsHrDEcJ8dT3DjIRnsWBLgXgtDg7KjjG7BGykf5URRQoNlOXSG+UEgdoMhccL8IMqhyzIB7fpyLoT4jYf0ZbXxaHfEcCI4l3XrV69pqlaumziWfV2FkxJN2NVXOYHX/aWP4r+ODSf8/2frMHPAqgO8q3VKEXt+PcCaKW9aqQmBKJgW/LOZem343Ilvk97sHtUVXL5wT+TWu4CvKoUG+Aw7MeX4ii5U6r9TK7q/R5Cg65Zt8o0DgMeeQvvX+1t+8UD9VYgA52ohTLQFLKVwrN0Vn51QeQsnNO/pC1nfFH1g/nUMHq8FmJEyujdbTGreG4OQEl/BPrfjVACrfyBkJe4Xpz3RvElK9FUIIBZvlo53i7gRYMH1uyhHKf7nnPjwh++iY5Dki3IZJW+X/t0ZwNrrhKylfDztIfL6/C0yOAkC4IXsKJ04H5oSwMIZAhZiilD+4rx2FLvHZ74HqdD3lD5N+6NuJu7/alLAWoqfpj0RXm15SfJVIQC2y+5yZ09gCj6wqEbIIsyIj9fV4+Hx1sTsJEgsJcMIrxSPdnijD/p0bhSwhtKxtGtCfp9MSWFaCID2eMs73eeafAFonQbSSjhUwj19qVQK2HutimtCbklJSTSpwpG0B6sY/am4lmxgFYWPOjwT8PIdKXFrhgDkm9nnnRsYCXNXgMVVqhYT5vIE3f1DczV/rDarKuSu34inArYVP0i7sBJwJlQ4wEoKH6Rd0WwlJVVf+lUhAImA/f7FwZzODABLJ2SXojNZgouZbLKVv0w1Z0oIKdFGs3nkUIeHLAcilUQEZAXFw2mXgJf4uUz+oNUMAeb6/E1n8n36ci+wrBJdhu7vI+jP9SYCDkw3Y1oIKTFoXhz5Z6eH3A3MAlnGyKG0ZzSbSImZdkZtBxBUZjengp51RmSD+D33S2YXJ2s8vNTgpHIr+GwcPtgZEDoU3u/0RbOxtt6anVROYrvoGDqQMJnd/G8mfTU6GZXyeME/m1XKnYGLmToREQZ2sHmmPd8CV9tX/EhAcXsAAAAASUVORK5CYII=',
		iconRetinaUrl: 'data:image/png;base64,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'
	}});

	$('<style>').prop('type', 'text/css').html('.iago-agent-popup {\n	-webkit-transition: opacity 500ms ease;\n	-moz-transition: opacity 500ms ease;\n	-ms-transition: opacity 500ms ease;\n	-o-transition: opacity 500ms ease;\n	transition: opacity 500ms ease;\n}\n.iago-agent-popup:hover {\n	opacity: 0.2 !important;\n}\n\n.iago-agent-popup .nickname,\n.iago-portal-popup .name {\n	font-weight: bold;\n}\n\n.iago-portal-popup .portalimage {\n	display: block;\n	padding-top: 10px;\n	max-width: 200px !important;\n	max-height: 150px !important;\n}\n\n/* hide button pane to save space */\n#dialog-plugin-iago {\n	min-height: 0 !important;\n}\n#dialog-plugin-iago + .ui-dialog-buttonpane {\n	display: none !important;\n}\n\n#plugin-iago-container {\n	margin: -12px; /* to remove dialog padding */\n	padding: 0 5px;\n}\n\n#plugin-iago-container p {\n	margin: 0.5em 0;\n}\n\n#plugin-iago-container.mobile {\n	background: transparent;\n	border: 0 none !important;\n	top: 0 !important;\n	left: 0 !important;\n	right: 0 !important;\n	bottom: 0 !important;\n	padding: 10px;\n	margin: 0;\n	position: absolute;\n	overflow: auto;\n}\n\n#plugin-iago-container.mobile select {\n	min-height: 30px;\n}\n\n.iago-popup .leaflet-popup-content a,\n.iago-popup .leaflet-popup-content select,\n#plugin-iago-container a,\n#plugin-iago-container select {\n	background: transparent;\n	color: rgb(255, 206, 0);\n	margin-right: 5px;\n	display: inline-block;\n	border: 1px solid #20A8B1;\n}\n\n.iago-popup .leaflet-popup-content a,\n#plugin-iago-container a {\n	padding: 3px 10px;\n}\n\n.iago-icon-cluster {\n	color: #C00;\n	vertical-align: middle;\n	text-align: center;\n	text-shadow: 0 0 1px white;\n	font-weight: bolder;\n}\n\n').appendTo('head');

	plugin.iago.layerLocations = L.layerGroup();
	addLayerGroup('IAGO player locations', plugin.iago.layerLocations, true);

	plugin.iago.layerClusters = L.layerGroup();
	addLayerGroup('IAGO clusters', plugin.iago.layerClusters, true);

	plugin.iago.layerGeometries = L.layerGroup();
	addLayerGroup('IAGO drawings', plugin.iago.layerGeometries, true);

	plugin.iago.layerPortals = L.layerGroup();
	addLayerGroup('IAGO portals', plugin.iago.layerPortals, true);

	plugin.iago.layerVolatiles = L.layerGroup();
	addLayerGroup('IAGO volatile portals', plugin.iago.layerVolatiles, true);

	plugin.iago.layerTargets = L.layerGroup();
	//addLayerGroup('IAGO targets', plugin.iago.layerTargets, true); // TODO uncomment when implemented

	//plugin.iago.layerWaypoints = L.layerGroup();
	//addLayerGroup('IAGO waypoints', plugin.iago.layerWaypoints, true);

	map.on('layeradd',function(obj) {
		if(obj.layer === plugin.iago.layerClusters
		|| obj.layer === plugin.iago.layerGeometries
		|| obj.layer === plugin.iago.layerLocations
		|| obj.layer === plugin.iago.layerPortals
		|| obj.layer === plugin.iago.layerTargets
		|| obj.layer === plugin.iago.layerVolatiles) {
			obj.layer.eachLayer(function(marker) {
				if(marker._icon) setupTooltips($(marker._icon));
			});
		}
	});

	plugin.iago.container = $('<div id="plugin-iago-container">');

	if(window.useAndroidPanes()) {
		android.addPane('plugin-iago', 'IAGO', 'ic_action_place');
		addHook('paneChanged', plugin.iago.onPaneChanged);
	} else {
		if(localStorage.iago_visible == 'true')
			plugin.iago.showDialog();
		$('#toolbox').append(' <a onclick="plugin.iago.showDialog()">IAGO</a>');
	}

	if(localStorage['iago'] !== null)
		plugin.iago.checkCredentials();
	else
		plugin.iago.render();

	window.addHook('portalSelected', function() {
		plugin.iago.render();
	});

	window.addPortalHighlighter(HIGHLIGHTER_NAME, {
		highlight: plugin.iago.highlight,
		setSelected: plugin.iago.onHighlighterChanged
	});

	addResumeFunction(plugin.iago.onResume);

	if(plugin.playerTracker && plugin.playerTracker.findUserPosition) {
		plugin.iago.findUserPositionOriginal = plugin.playerTracker.findUserPosition;
		plugin.playerTracker.findUserPosition = plugin.iago.findUserPosition;
	}
};

// PLUGIN END //////////////////////////////////////////////////////////


setup.info = plugin_info; //add the script info data to the function as a property
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);


