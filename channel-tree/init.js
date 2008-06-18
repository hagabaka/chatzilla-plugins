/* vim: sw=2:et
 *
 * channel-tree.js: chatzilla plugin to list tabs in a treeview
 *
 * The plugin displays open "tabs" in a treeview, which can replace the tab bar.
 * you can click on the tree items to switch the current view, and if you use the
 * tab bar to switch view, the selected item in the tree is updated. You can right
 * click tree cells to access the same context menu as tab context menu. Tree labels
 * can change color to indicate the view status, customizable through CSS.
 *
 * Check the github repository for updates:
 * http://github.com/hagabaka/chatzilla-plugins/tree/master
 * git://github.com/hagabaka/chatzilla-plugins.git
 *
 * TODO
 *
 * - Allow the tree to be placed on the left or right
 *
 * BUGS
 * 
 * - If the plugin is manually loaded after some views are open, styles on treecells
 *   are not applied except when they are hovered, or when the view state gets changed
 *   again. This situation disappears if the tree is redrawn such as when the window
 *   is resized to make the tree smaller
 * - DCC Windows are not displayed in tree, and with the plugin enabled they are not
 *   switched to automatically when opened
 * - Moving the userlist with the plugin enabled does not work as intended. ChatZilla
 *   might become unusable or the move does not happen
 * - Width of treeview is not persisted
 * - Treeitems at top level are displayed as having children even if they don't
 * 
 * AUTHOR
 *
 * Yaohan Chen "hagabaka" <yaohan.chen@gmail.com>
 *
 * CREDITS
 *
 * - Many thanks to Silver, ReadMe, worms, mzz and others on moznet for debug,
 *   javascript and XUL help
 */

plugin.id = "channel-tree";

plugin.init = function(glob) {
  plugin.major = 1;
  plugin.minor = 0;
  plugin.version = plugin.major + "." + plugin.minor + " (10 Jun 2008)";
  plugin.description = "List tabs in a tree";

  plugin.hooks = [];

  return "OK";
}

plugin.enable = function() {
  var stylesheet = document.createProcessingInstruction("xml-stylesheet",
    'href="' + plugin.cwd + 'style.css"');
  document.insertBefore(stylesheet, document.firstChild);
  plugin.stylesheet = stylesheet;

  var splitter = document.createElement("splitter");
  var grippy = document.createElement("grippy");
  splitter.setAttribute("collapse", "before");
  splitter.setAttribute("id", "splitter[" + plugin.id + "]");
  splitter.setAttribute("persist", "collapsed left");
  splitter.appendChild(grippy);
  plugin.splitter = splitter;

  var tree = document.createElement("tree");
  tree.setAttribute("id", "channel-tree");
  tree.setAttribute("hidecolumnpicker", "true");
  tree.setAttribute("seltype", "single");
  tree.setAttribute("width", "166");
  plugin.tree = tree;

  var treeCols = document.createElement("treecols");
  var treeCol = document.createElement("treecol");
  treeCol.setAttribute("flex", "1");
  treeCol.setAttribute("primary", "true");
  treeCol.setAttribute("hideheader", "true");

  tree.appendChild(treeCols);
  treeCols.appendChild(treeCol);

  var treeChildren = document.createElement("treechildren");
  tree.appendChild(treeChildren);
  plugin.treeChildrenNode = treeChildren;

  var box = document.getElementById("tabpanels-contents-box");
  box.insertBefore(splitter, box.firstChild);
  box.insertBefore(tree, box.firstChild);
  plugin.box = box;
  plugin.treeView = tree.view;

  // add existing tabs into tree
  for(var i = 0; i < client.viewsArray.length; i++) {
    var v = client.viewsArray[i];
    // if(v.tb && v.source)
    plugin.handleNewView(v.source);
  }
  tree.treeBoxObject.clearStyleAndImageCaches();

  plugin.addHook("create-tab-for-view",
    function(e) {
      var o = e.view;
      plugin.handleNewView(o);
    }, false);

  plugin.addHook("delete-view",
    function(e) {
      var o = e.view
      var p = plugin.getTreeParent(o);
      // unregister o as a children of its parent
      if(p) {
        var index = p.children.indexOf(o);
        if(index >= 0) delete p.children[index];
      }
      if(!o.treeItemNode) return;
      // only delete from tree when o is a child node or it has no children
      if(!o.children || o.children.length == 0) {
        o.treeItemNode.parentNode.removeChild(o.treeItemNode);
        delete o.treeItemNode;
        if("childrenNode" in o) delete o.treeChildrenNode;
      }
    }, false);

  plugin.addHook("set-current-view",
    function(e) {
      var o = e.view;
      plugin.handleNewView(o);
      plugin.setCurrentView(o);
    }, false);

  // switch view when tree item is selected
  tree.addEventListener("select",
    function(e) {
      selectedObject = plugin.objectSelectedInTree();
      // recreate view when it is closed, this happens for network tabs
      if(!("messages" in selectedObject)) {
        client.dispatch("create-tab-for-view", {view: selectedObject});
      }
      client.dispatch("set-current-view", {view: selectedObject});
      setTimeout('dispatch("focus-input")', 0);
    }, false);

  // duplicate context menu of corresponding tabs to tree item
  plugin.contextId = "context:" + plugin.id;
  client.menuSpecs[plugin.contextId] = {
    getContext: function(cx) {
      if(!cx) cx = new Object();
      cx.__proto__ = getObjectDetails(plugin.objectSelectedInTree());
      return cx;
    },
    items: client.menuSpecs["context:tab"].items}
  tree.setAttribute("context", plugin.contextId);
  client.updateMenus();

  // decorate setTabState function to make it update property on tree item
  plugin.originalSetTabState = setTabState;
  setTabState = function(source, what, callback) {
    plugin.handleNewView(source);
    plugin.originalSetTabState(source, what, callback);

    // following block copied from static.js lines 2696-2718 function setTabState
    if (typeof source != "object")
    {
      if (!ASSERT(source in client.viewsArray,
          "INVALID SOURCE passed to setTabState"))
      return;
      source = client.viewsArray[source].source;
    }

    plugin.syncStateForObject(source);
  }

  return true;
}

plugin.disable = function() {
  setTabState = plugin.originalSetTabState;
  for(var hook in plugin.hooks) {
    client.commandManager.removeHook(hook.name, hook.id, hook.before);
  }
  plugin.box.removeChild(plugin.tree);
  plugin.box.removeChild(plugin.splitter);
  delete client.menuSpecs[plugin.contextId];
  client.updateMenus();
  document.removeChild(plugin.stylesheet);
  return true;
}

// add a hook and remember it so it's automatically removed on disable
plugin.addHook = function(name, hook, before) {
  var id = plugin.id + "-" + name;
  plugin.hooks.push({"name": name, "id": id, "before": before});
  client.commandManager.addHook(name, hook, id, before);
}

// if o has not been encountered, add to tree, otherwise do nothing
plugin.handleNewView = function(o) {
  if("treeItemNode" in o) return;
  o.children = o.children || [];
  var parent = plugin.getTreeParent(o);
  if(parent) {
    plugin.handleNewView(parent);
    // register o as parent's child
    if(parent.children.indexOf(o) < 0)
      parent.children.push(o);
    plugin.addToTree(o, parent.treeChildrenNode);
  } else {
    plugin.addToTreeAsParent(o);
  }
}

// add an entry to the tree for the object, under the treerows node specified by "at"
plugin.addToTree = function(o, at) {
  var id = plugin.getIdForObject(o);
  var treeItem = document.getElementById(id);
  if(!treeItem) {
    // add to tree
    treeItem = document.createElement("treeitem");
    treeItem.setAttribute("id", id);
    var treeRow = document.createElement("treerow");
    var treeCell = document.createElement("treecell");
    treeCell.setAttribute("label", plugin.getLabelForObject(o));

    treeItem.appendChild(treeRow);
    treeRow.appendChild(treeCell);

    at.appendChild(treeItem);
  }
  // if the tree item is already there, associate it with the object
  o.treeItemNode = treeItem;
  treeItem.object = o;
  plugin.syncStateForObject(o);
  return treeItem;
}

// add an entry to the tree for the object, at top level, and mark it as a container
// o.treeChildrenNode is set to the treerows under the added object, where children can be added
plugin.addToTreeAsParent = function(o) {
  var treeItem = plugin.addToTree(o, plugin.treeChildrenNode);
  treeItem.setAttribute("container", "true");
  treeItem.setAttribute("open", "true");
  var treeChildrenId = treeItem.getAttribute("id") + "-treechildren";
  var treeChildren = document.getElementById(treeChildrenId);
  if(!treeChildren) {
    treeChildren = document.createElement("treechildren");
    treeChildren.setAttribute("id", treeChildrenId);
  }
  treeItem.appendChild(treeChildren);
  o.treeChildrenNode = treeChildren;
  return treeItem;
}

// set property for the treecell most directly under the given treeItemNode
plugin.setTreeCellProperty = function(treeItemNode, property) {
  var treeCell = treeItemNode.firstChild.firstChild
  var originalProperties = treeCell.getAttribute("properties");
  var newProperties = originalProperties.replace(
    /attention|activity|superfluous|channel-tree-current/, "");
  newProperties += " " + property;
  treeItemNode.firstChild.firstChild.setAttribute("properties", newProperties);
}

// return parent of an object, in a definition consistent to the tree structure
// IRCNetwork and IRCDCC objects are considered top level
plugin.getTreeParent = function(o) {
  // memoized result
  if("treeParent" in o) return o.treeParent;
  // objects treated as top level, this line might not be necessary
  if("IRCNetwork" == o.TYPE) return undefined;

  var parent = o.parent;
  // skip IRCServer and IRCDCC objects and use the network or *client* as parent
  if(parent && ["IRCServer", "IRCDCC"].indexOf(parent.TYPE) >= 0)
    parent = parent.parent;

  // memoize the result in o.treeParent;
  o.treeParent = parent;
  return parent;
}

plugin.objectSelectedInTree = function() {
  return plugin.treeView.getItemAtIndex(plugin.tree.currentIndex).object;
}

plugin.setCurrentView = function(o) {
  var index = plugin.treeView.getIndexOfItem(o.treeItemNode);
  plugin.treeView.selection.select(index);
  var currentNode = o.treeItemNode;
  // we use the property "channel-tree-current" instead of "current", because the
  // latter is used by XUL. although in practice the two should have the same
  // effect
  plugin.setTreeCellProperty(currentNode, "channel-tree-current");
  var lastNode = plugin.lastCurrentTreeItemNode;
  if(lastNode && lastNode != currentNode) {
    plugin.setTreeCellProperty(lastNode, "");
  }
  plugin.lastCurrentTreeItemNode = currentNode;
}

plugin.syncStateForObject = function(o) {
  var tb = getTabForObject(o, true);

  // copy the just set state on tb to treeItemNode's property
  state = tb.getAttribute("state");
  if(state == "current") {
    plugin.setCurrentView(o);
  } else {
    plugin.setTreeCellProperty(o.treeItemNode, state);
  }
}

// return an unique and consistent ID for the treeitem for the object based on its
// unicodeName and that of its parent. the format is "treeitem[parent][name]", and
// for top level nodes it's "treeitem[][name]"
plugin.getIdForObject = function(o) {
  var p = plugin.getTreeParent(o);
  var parentName = p ? plugin.getLabelForObject(p) : "";
  return "treeitem-" + parentName + "-" + plugin.getLabelForObject(o);
}

plugin.getLabelForObject = function(o) {
  return getTabForObject(o, true).getAttribute("label");
}
