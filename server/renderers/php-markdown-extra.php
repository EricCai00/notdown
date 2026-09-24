<?php
// Library path comes from server configuration, never from Markdown or HTTP input.
$directory = $argv[1];
require $directory . '/MarkdownInterface.php';
require $directory . '/Markdown.php';
require $directory . '/MarkdownExtra.php';
if (in_array('--version', $argv, true)) {
    echo 'PHP Markdown Extra ' . \Michelf\MarkdownExtra::MARKDOWNLIB_VERSION;
} else {
    echo \Michelf\MarkdownExtra::defaultTransform(stream_get_contents(STDIN));
}
