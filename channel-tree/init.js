/* vim: sw=2:et
 *
 * channel-tree.js: chatzilla plugin to list tabs in a treeview
 *
 * The plugin displays open "tabs" in a treeview, which can replace the tab bar.
 * you can click on the tree items to switch the current view, and if you use the
 * tab bar to switch view, the selected item in the tree is updated.
 *
 * Check the github repository for updates:
 * http://github.com/hagabaka/chatzilla-plugins/tree/master
 * git://github.com/hagabaka/chatzilla-plugins.git
 *
 * TODO
 *
 * - Use tree labels to display window status like tab labels
 * - Allow the tree to be placed on the left or right
 *
 * BUGS
 *
 * - Sometimes, maybe after switching view too frequently, the tree items get
 *   associated with incorrect views
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
  stylesheet = document.createProcessingInstruction("xml-stylesheet",
    'href="' + plugin.cwd + 'style.css"');
  document.insertBefore(stylesheet, document.firstChild);
  plugin.stylesheet = stylesheet;

  splitter = document.createElement("splitter");
  grippy = document.createElement("grippy");
  splitter.setAttribute("collapse", "after");
  splitter.setAttribute("id", "splitter[" + plugin.id + "]");
  splitter.setAttribute("persist", "collapsed left");
  splitter.appendChild(grippy);
  plugin.splitter = splitter;

  tree = document.createElement("tree");
  tree.setAttribute("id", "tree[" + plugin.id + "]");
  tree.setAttribute("flex", "1");
  tree.setAttribute("hidecolumnpicker", "true");
  tree.setAttribute("seltype", "single");
  tree.setAttribute("persist", "collapsed width");
  plugin.tree = tree;

  treeCols = document.createElement("treecols");
  treeCol = document.createElement("treecol");
  treeCol.setAttribute("flex", "1");
  treeCol.setAttribute("primary", "true");
  treeCol.setAttribute("hideheader", "true");

  tree.appendChild(treeCols);
  treeCols.appendChild(treeCol);

  treeChildren = document.createElement("treechildren");
  tree.appendChild(treeChildren);
  plugin.treeChildrenNode = treeChildren;

  box = document.getElementById("tabpanels-contents-box");
  box.insertBefore(splitter, box.firstChild);
  box.insertBefore(tree, box.firstChild);
  plugin.box = box;
  plugin.treeView = tree.view;

  plugin.addHook("create-tab-for-view",
    function(e) {
      o = e.view;
      if("treeItemNode" in o) return;
      o.children = o.children || [];
      parent = plugin.getTreeParent(o);
      if(parent) {
        // register o as parent's child
        if(parent.children.indexOf(o) < 0)
          parent.children.push(o);
        plugin.addToTreeAsParent(parent);
        plugin.addToTree(o, parent.treeChildrenNode);
      } else {
        plugin.addToTreeAsParent(o);
      }
    }, false);

  plugin.addHook("delete-view",
    function(e) {
      o = e.view
      p = plugin.getTreeParent(o);
      // unregister o as a children of its parent
      if(p && p.children.indexOf(o) < 0)
        p.children = p.children.filter(function(i) {i != o});
      if(!o.treeItemNode) return;
      // only delete from tree when o is a child node or it has no children
      if(!o.children || o.children.length == 0) {
        o.treeItemNode.parentNode.removeChild(o.treeItemNode);
        o.treeItemNode = undefined;
      }
    }, false);

  plugin.addHook("set-current-view",
    function(e) {
      o = e.view;
      index = plugin.treeView.getIndexOfItem(o.treeItemNode);
      plugin.treeView.selection.select(index);
      plugin.setTreeCellProperty(o.treeItemNode, "current");
    }, false);

  tree.addEventListener("select",
    function(e) {
      selectedObject = plugin.objectSelectedInTree();
      client.dispatch("set-current-view", {view: selectedObject});
    }, false);

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
    plugin.originalSetTabState(source, what, callback);

    // following block copied from static.js lines 2696-2718 function setTabState
    if (typeof source != "object")
    {
      if (!ASSERT(source in client.viewsArray,
          "INVALID SOURCE passed to setTabState"))
      return;
      source = client.viewsArray[source].source;
    }
    tb = source.dispatch("create-tab-for-view", { view: source });

    // copy the just set state on tb to treeItemNode's property
    plugin.setTreeCellProperty(source.treeItemNode, tb.getAttribute("state"));
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

plugin.addHook = function(name, hook, before) {
  id = plugin.id + "-" + name;
  plugin.hooks.push({"name": name, "id": id, "before": before});
  client.commandManager.addHook(name, hook, id, before);
}

// add an entry to the tree for the object, under the treerows node specified by "at"
plugin.addToTree = function(o, at) {
  id = plugin.getIdForObject(o);
  treeItem = document.getElementById(id);
  if(!treeItem) {
    // add to tree
    treeItem = document.createElement("treeitem");
    treeItem.setAttribute("id", id);
    treeRow = document.createElement("treerow");
    treeCell = document.createElement("treecell");
    treeCell.setAttribute("label", o.unicodeName);

    treeItem.appendChild(treeRow);
    treeRow.appendChild(treeCell);

    at.appendChild(treeItem);
    o.treeItemNode = treeItem;
    treeItem.object = o;
    plugin.setTreeCellProperty(treeItem, "normal");
  } 
  return treeItem;
}

// add an entry to the tree for the object, at top level, and mark it as a container
// o.treeChildrenNode is set to the treerows under the added object, where children can be added
plugin.addToTreeAsParent = function(o) {
  treeItem = plugin.addToTree(o, plugin.treeChildrenNode);
  if(!("treeChildrenNode" in o)) {
    treeItem.setAttribute("container", "true");
    treeItem.setAttribute("open", "true");
    treeChildren = document.createElement("treechildren");
    treeItem.appendChild(treeChildren);
    o.treeChildrenNode = treeChildren;
  }
  return treeItem;
}

// set property for the treecell most directly under the given treeItemNode
plugin.setTreeCellProperty = function(treeItemNode, property) {
  treeItemNode.firstChild.firstChild.setAttribute("property", property);
}

// return parent of an object, in a definition consistent to the tree structure
// IRCNetwork and IRCDCC objects are considered top level
plugin.getTreeParent = function(o) {
  // memoized result
  if("treeParent" in o) return o.treeParent;
  // objects treated as top level, this line might not be necessary
  if(["IRCNetwork", "IRCDCC"].indexOf(o.TYPE) >= 0) return undefined;

  parent = o.parent;
  // skip IRCServer objects and use the network as parent
  if(parent && parent.TYPE == "IRCServer")
    parent = parent.parent;

  // memoize the result in o.treeParent;
  o.treeParent = parent;
  return parent;
}

plugin.objectSelectedInTree = function() {
  return plugin.treeView.getItemAtIndex(tree.currentIndex).object;
}

// return an unique and consistent ID for the treeitem for the object based on its
// unicodeName and that of its parent. the format is "treeitem[parent][name]", and
// for top level nodes it's "treeitem[][name]"
plugin.getIdForObject = function(o) {
  p = plugin.getTreeParent(o);
  parentName = p ? p.unicodeName : "";
  return "treeitem[" + parentName + "][" + o.unicodeName + "]";
}

