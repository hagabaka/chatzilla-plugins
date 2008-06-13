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
  box.appendChild(splitter);
  box.appendChild(tree);
  plugin.box = box;
  plugin.treeView = tree.view;

  plugin.addHook("create-tab-for-view",
    function(e) {
      o = e.view;
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
      // only delete from tree when o is a child node or it has no children
      if(!o.children || o.children.length == 0) {
        if(o.treeItemNode) {
          o.treeItemNode.parentNode.removeChild(o.treeItemNode);
          o.treeItemNode = undefined;
        }
      }
    }, false);

  plugin.addHook("set-current-view",
    function(e) {
      o = e.view;
      index = plugin.treeView.getIndexOfItem(o.treeItemNode);
      plugin.treeView.selection.select(index);
    }, false);

  tree.addEventListener("select",
    function(e) {
      treeItem = plugin.objectSelectedInTree();
      client.dispatch("set-current-view", {view: treeItem.object});
    }, false);

  plugin.contextId = "context:" + plugin.id;
  client.menuSpecs[plugin.contextId] = {
    getContext: function(cx) {
      if(!cx) cx = new Object();
      cx.__proto__ = getObjectDetails(plugin.objectSelectedInTree().object);
      return cx;
    },
    items: client.menuSpecs["context:tab"].items}
  tree.setAttribute("context", plugin.contextId);
  client.updateMenus();

  return true;
}

plugin.disable = function() {
  for(var hook in plugin.hooks) {
    client.commandManager.removeHook(hook.name, hook.id, hook.before);
  }
  plugin.box.removeChild(plugin.tree);
  plugin.box.removeChild(plugin.splitter);
  delete client.menuSpecs[plugin.contextId];
  client.updateMenus();
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
  return plugin.treeView.getItemAtIndex(tree.currentIndex);
}
// return an unique and consistent ID for the treeitem for the object based on its
// unicodeName and that of its parent. the format is "treeitem[parent][name]", and
// for top level nodes it's "treeitem[][name]"
plugin.getIdForObject = function(o) {
  p = plugin.getTreeParent(o);
  parentName = p ? p.unicodeName : "";
  return "treeitem[" + parentName + "][" + o.unicodeName + "]";
}

