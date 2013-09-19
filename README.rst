==================
ChatZilla_ Plugins
==================
.. _ChatZilla: http://chatzilla.hacksrus.com/

channel-tree
------------
Shows a tree for your server, channel, and private message views. With the tree
you can see activity in channels and servers, part, disconnect, toggle whether
to connect/join on start up, just like with the tabs. Unlike tabs, when you
open many channels, their names won't be squished into one unintelligible
horizontal row.

License: `CC BY 3.0`_

.. _`CC BY 3.0`: http://creativecommons.org/licenses/by/3.0/

To Install a Plugin
-------------------
"Automatically"
...............
Zip the plugin directory, use ChatZilla's "Install Plugin" menu, and select
the zip.

"Manually"
..........
Place plugin directory in chatzilla/scripts in your ChatZilla profile
directory. You should end up with the following file structure::

  <home directory>
  └── .chatzilla
      └── xxxxxx.default
          └── chatzilla
              └── scripts
                  └── <plugin directory>
                      ├── init.js
                      └── <other plugin files>
  
