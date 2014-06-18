// ==UserScript==
// @id             iitc-plugin-kml-string-creator@KidTM
// @name           IITC plugin: KML string creator
// @category       Info
// @version        0.1.0
// @namespace      
// @updateURL      http://kolpakovaleksandr.github.io/iitc-plugin-kml-string-creator/iitc-plugin-kml-string-creator.js
// @downloadURL    http://kolpakovaleksandr.github.io/iitc-plugin-kml-string-creator/iitc-plugin-kml-string-creator.js
// @description    
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==


function wrapper(plugin_info) {
if(typeof window.plugin !== 'function') window.plugin = function() {};

plugin_info.buildName = 'jonatkins-test';
plugin_info.dateTimeVersion = '20140616.193204';
plugin_info.pluginId = 'kml-string-creator';
//END PLUGIN AUTHORS NOTE



// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin
window.plugin.kmlstringcreator = function() {};

window.plugin.kmlstringcreator.listPortals = [];
window.plugin.kmlstringcreator.sortBy = 'level';
window.plugin.kmlstringcreator.sortOrder = -1;
window.plugin.kmlstringcreator.enlP = 0;
window.plugin.kmlstringcreator.resP = 0;
window.plugin.kmlstringcreator.filter = 0;

//fill the listPortals array with portals avaliable on the map (level filtered portals will not appear in the table)
window.plugin.kmlstringcreator.getPortals = function() {
  //filter : 0 = All, 1 = Res, 2 = Enl
  var retval=false;

  var displayBounds = map.getBounds();

  window.plugin.kmlstringcreator.listPortals = [];
  $.each(window.portals, function(i, portal) {
    // eliminate offscreen portals (selected, and in padding)
    if(!displayBounds.contains(portal.getLatLng())) return true;

    retval=true;
    var d = portal.options.data;
    var teamN = portal.options.team;

    switch (teamN) {
      case TEAM_RES:
        window.plugin.kmlstringcreator.resP++;
        break;
      case TEAM_ENL:
        window.plugin.kmlstringcreator.enlP++;
        break;
    }
    var l = window.getPortalLinks(i);
    var f = window.getPortalFields(i);
    var ap = portalApGainMaths(d.resCount, l.in.length+l.out.length, f.length);

    var thisPortal = {
      'portal': portal,
      'guid': i,
      'teamN': teamN, // TEAM_NONE, TEAM_RES or TEAM_ENL
      'team': d.team, // "NEUTRAL", "RESISTANCE" or "ENLIGHTENED"
      'name': d.title || '(untitled)',
      'nameLower': d.title && d.title.toLowerCase(),
      'level': portal.options.level,
      'health': d.health,
      'resCount': d.resCount,
      'img': d.img,
      'linkCount': l.in.length + l.out.length,
      'link' : l,
      'fieldCount': f.length,
      'field' : f,
      'enemyAp': ap.enemyAp,
      'ap': ap,
    };
    window.plugin.kmlstringcreator.listPortals.push(thisPortal);
  });

  return retval;
}

window.plugin.kmlstringcreator.displayPL = function() {
  var html = '';
  window.plugin.kmlstringcreator.sortBy = 'level';
  window.plugin.kmlstringcreator.sortOrder = -1;
  window.plugin.kmlstringcreator.enlP = 0;
  window.plugin.kmlstringcreator.resP = 0;
  window.plugin.kmlstringcreator.filter = 0;

  if (window.plugin.kmlstringcreator.getPortals()) {
    html += window.plugin.kmlstringcreator.portalTable(window.plugin.kmlstringcreator.sortBy, window.plugin.kmlstringcreator.sortOrder,window.plugin.kmlstringcreator.filter);
  } else {
    html = '<table class="noPortals"><tr><td>Nothing to show!</td></tr></table>';
  };

  if(window.useAndroidPanes()) {
    $('<div id="portalslist" class="mobile">' + html + '</div>').appendTo(document.body);
  } else {
    dialog({
      html: '<div id="portalslist">' + html + '</div>',
      dialogClass: 'ui-dialog-portalslist',
      title: 'Получить KML: ' + window.plugin.kmlstringcreator.listPortals.length + ' ' + (window.plugin.kmlstringcreator.listPortals.length == 1 ? 'portal' : 'порталов'),
      id: 'portal-list',
      width: 700
    });
  }
}

window.plugin.kmlstringcreator.portalTable = function(sortBy, sortOrder, filter) {
  // save the sortBy/sortOrder/filter
  window.plugin.kmlstringcreator.sortBy = sortBy;
  window.plugin.kmlstringcreator.sortOrder = sortOrder;
  window.plugin.kmlstringcreator.filter = filter;

  var portals=window.plugin.kmlstringcreator.listPortals;

  //Array sort
  window.plugin.kmlstringcreator.listPortals.sort(function(a, b) {
    var retVal = 0;

    var aComp = a[sortBy];
    var bComp = b[sortBy];

    if (aComp < bComp) {
      retVal = -1;
    } else if (aComp > bComp) {
      retVal = 1;
    } else {
      // equal - compare GUIDs to ensure consistent (but arbitrary) order
      retVal = a.guid < b.guid ? -1 : 1;
    }

    // sortOrder is 1 (normal) or -1 (reversed)
    retVal = retVal * sortOrder;
    return retVal;
  });

  var sortAttr = window.plugin.kmlstringcreator.portalTableHeaderSortAttr;
  var kml = '&lt;?xml version="1.0" encoding="UTF-8"?&gt;&lt;kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom"&gt;&lt;Document&gt;&lt;name&gt;INGRESS PORTAL MAP&lt;/name&gt;&lt;Style id="IngressPortal"&gt;&lt;IconStyle&gt;&lt;Icon&gt;&lt;href&gt;http://i62.fastpic.ru/big/2014/0605/63/1b86cf954d65c8abcf2debe16232f963.png&lt;/href&gt;&lt;/Icon&gt;&lt;/IconStyle&gt;&lt;/Style&gt;';
  var html = window.plugin.kmlstringcreator.stats();
  html += '<table class="portals">'
    + '<tr class="header">'
    + '<th>#</th>'
    + '<th ' + sortAttr('nameLower', sortBy, 1, 'portalTitle') + '>Portal Name</th>'
    + '<th ' + sortAttr('level', sortBy, -1) + '>Level</th>'
    + '<th ' + sortAttr('teamN', sortBy, 1) + '>Team</th>'
    + '<th ' + sortAttr('health', sortBy, -1) + '>Health</th>'
    + '<th ' + sortAttr('resCount', sortBy, -1) + '>Res</th>'
    + '<th ' + sortAttr('linkCount', sortBy, -1) + '>Links</th>'
    + '<th ' + sortAttr('fieldCount', sortBy, -1) + '>Fields</th>'
    + '<th ' + sortAttr('enemyAp', sortBy, -1) + '>AP</th>'
    + '</tr>\n';

  var rowNum = 1;

  $.each(portals, function(ind, portal) {
    if (filter === TEAM_NONE || filter === portal.teamN) {
      kml +=  window.plugin.kmlstringcreator.getKMLString(portal, portal.guid);
      rowNum++;
    }
  });
  html += '</table>';
  html += '<div class="disclaimer">' + kml + '&lt;/Document&gt;&lt;/kml&gt;' + '</div>';
  
  return html;
}

window.plugin.kmlstringcreator.stats = function(sortBy) {
  var html = '<table class="teamFilter"><tr>'
    + '<td class="filterAll" style="cursor:pointer"><a href=""></a>All Portals : (click to filter)</td><td class="filterAll">' + window.plugin.kmlstringcreator.listPortals.length + '</td>'
    + '<td class="filterRes" style="cursor:pointer" class="sorted">Resistance Portals : </td><td class="filterRes">' + window.plugin.kmlstringcreator.resP +' (' + Math.floor(window.plugin.kmlstringcreator.resP/window.plugin.kmlstringcreator.listPortals.length*100) + '%)</td>'
    + '<td class="filterEnl" style="cursor:pointer" class="sorted">Enlightened Portals : </td><td class="filterEnl">'+ window.plugin.kmlstringcreator.enlP +' (' + Math.floor(window.plugin.kmlstringcreator.enlP/window.plugin.kmlstringcreator.listPortals.length*100) + '%)</td>'
    + '</tr>'
    + '</table>';
  return html;
}

// A little helper function so the above isn't so messy
window.plugin.kmlstringcreator.portalTableHeaderSortAttr = function(name, by, defOrder, extraClass) {
  // data-sort attr: used by jquery .data('sort') below
  var retVal = 'data-sort="'+name+'" data-defaultorder="'+defOrder+'" class="'+(extraClass?extraClass+' ':'')+'sortable'+(name==by?' sorted':'')+'"';

  return retVal;
};

//get KML string
window.plugin.kmlstringcreator.getKMLString = function(portal,guid) {
var coord = portal.portal.getLatLng();
var latlng = [coord.lat, coord.lng].join();
var jsSingleClick = 'window.renderPortalDetails(\''+guid+'\');return false';
var jsDoubleClick = 'window.zoomToAndShowPortal(\''+guid+'\', ['+latlng+']);return false';
var perma = '/intel?latE6='+coord.lat+'&lngE6='+coord.lng+'&z=17&pguid='+guid;

//Use Jquery to create the link, which escape characters in TITLE and ADDRESS of portal
var a = $('<a>',{
  "class": 'help',
  text: portal.name,
  title: portal.name,
  href: perma,
  onClick: jsSingleClick,
  onDblClick: jsDoubleClick
})[0].outerHTML;
var kml = '&lt;Placemark&gt;&lt;name&gt;' + a + '&lt;/name&gt;&lt;styleUrl&gt;#IngressPortal&lt;/styleUrl&gt;&lt;Point&gt;&lt;coordinates&gt;' + coord.lng+','+coord.lat+'&lt;/coordinates&gt;&lt;/Point&gt;&lt;/Placemark&gt;';
return kml;
}

window.plugin.kmlstringcreator.onPaneChanged = function(pane) {
  if(pane == "plugin-portalslist")
    window.plugin.kmlstringcreator.displayPL();
  else
    $("#portalslist").remove()
};

var setup =  function() {
  if(window.useAndroidPanes()) {
    android.addPane("plugin-kmlstringcreator", "KML string creator", "ic_action_paste");
    addHook("paneChanged", window.plugin.kmlstringcreator.onPaneChanged);
  } else {
    $('#toolbox').append(' <a onclick="window.plugin.kmlstringcreator.displayPL()" title="Создает KML-ку порталов в области просмотра">Получить KML</a>');
  }

  $('head').append('<style>' +
    '#portalslist.mobile {background: transparent; border: 0 none !important; height: 100% !important; width: 100% !important; left: 0 !important; top: 0 !important; position: absolute; overflow: auto; }' +
    '#portalslist table { margin-top:5px; border-collapse: collapse; empty-cells: show; width: 100%; clear: both; }' +
    '#portalslist table td, #portalslist table th {border-bottom: 1px solid #0b314e; padding:3px; color:white; background-color:#1b415e}' +
    '#portalslist table tr.res td { background-color: #005684; }' +
    '#portalslist table tr.enl td { background-color: #017f01; }' +
    '#portalslist table tr.neutral td { background-color: #000000; }' +
    '#portalslist table th { text-align: center; }' +
    '#portalslist table td { text-align: center; }' +
    '#portalslist table.portals td { white-space: nowrap; }' +
    '#portalslist table td.portalTitle { text-align: left;}' +
    '#portalslist table th.sortable { cursor:pointer;}' +
    '#portalslist table th.portalTitle { text-align: left;}' +
    '#portalslist table .portalTitle { min-width: 120px !important; max-width: 240px !important; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }' +
    '#portalslist table .apGain { text-align: right !important; }' +
    '#portalslist .sorted { color:#FFCE00; }' +
    '#portalslist .filterAll { margin-top: 10px;}' +
    '#portalslist .filterRes { margin-top: 10px; background-color: #005684  }' +
    '#portalslist .filterEnl { margin-top: 10px; background-color: #017f01  }' +
    '#portalslist .disclaimer { margin-top: 10px; font-size:10px; }' +
    '</style>');

  // Setup sorting
  $(document).on('click.portalslist', '#portalslist table th.sortable', function() {
    var sortBy = $(this).data('sort');
    // if this is the currently selected column, toggle the sort order - otherwise use the columns default sort order
    var sortOrder = sortBy == window.plugin.kmlstringcreator.sortBy ? window.plugin.kmlstringcreator.sortOrder*-1 : parseInt($(this).data('defaultorder'));
    $('#portalslist').html(window.plugin.kmlstringcreator.portalTable(sortBy,sortOrder,window.plugin.kmlstringcreator.filter));
  });

  $(document).on('click.portalslist', '#portalslist .filterAll', function() {
    $('#portalslist').html(window.plugin.kmlstringcreator.portalTable(window.plugin.kmlstringcreator.sortBy,window.plugin.kmlstringcreator.sortOrder,0));
  });
  $(document).on('click.portalslist', '#portalslist .filterRes', function() {
    $('#portalslist').html(window.plugin.kmlstringcreator.portalTable(window.plugin.kmlstringcreator.sortBy,window.plugin.kmlstringcreator.sortOrder,1));
  });
  $(document).on('click.portalslist', '#portalslist .filterEnl', function() {
    $('#portalslist').html(window.plugin.kmlstringcreator.portalTable(window.plugin.kmlstringcreator.sortBy,window.plugin.kmlstringcreator.sortOrder,2));
  });
}

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
