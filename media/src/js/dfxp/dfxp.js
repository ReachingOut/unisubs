// Amara, universalsubtitles.org
// 
// Copyright (C) 2013 Participatory Culture Foundation
// 
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
// 
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
// 
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see 
// http://www.gnu.org/licenses/agpl-3.0.html.

var AmaraDFXPParser = function(AmaraDFXPParser) {
    /*
     * A utility for working with DFXP subs.
     * The front end app needs all timming data to be
     * stored in milliseconds for processing. On `init` we convert
     * time expressions to milliseconds.
     */

    var MARKUP_REPLACE_SEQ = [
        [/(\*\*)([^\*]+)(\*\*)/g, '<span tts:fontWeight="bold">$2</span>'],
        [/(\*)([^\*]+)(\*{1})/g, '<span tts:fontStyle="italic">$2</span>'],
        [/(_)([^_]+)(_{1})/g, '<span tts:textDecoration="underline">$2</span>']
    ];
    var DFXP_REPLACE_SEQ = [
        ["span[tts\\:fontWeight='bold']", "**"],
        ["span[tts\\:fontStyle='italic']", "*"],
        ["span[tts\\:textDecoration='underline']", "_"],
        ["br", "\n"],

        // When jQuery creates elements, it lowercases all attributes. We fix
        // this when sending back to the server in xmlToString, but for unit
        // testing we need to match manually created elements, too.
        ["span[tts\\:fontweight='bold']", "**"],
        ["span[tts\\:fontstyle='italic']", "*"],
        ["span[tts\\:textdecoration='underline']", "_"]
    ];

    var that = this;
    var $ = window.AmarajQuery? window.AmarajQuery.noConflict(): window.$;
    var AmarajQuery = window.AmarajQuery || null;

    this.init = function(xml) {

        // This second check for xml === null is for a specific IE9 bug.
        if (typeof xml === 'undefined' || xml === null) {
            return;
        }

        if (typeof xml === 'string') {
            xml = $.parseXML(xml);
        }

        // When we get subtitles from the server, they will contain DFXP-style
        // formatting for bold, italic, etc. Convert them back to Markdown.
        var $preXml = $(xml.documentElement);
        var $preSubtitles = $('p', $preXml);

        // Convert subtitles from DFXP to Markdown.
        for (var i = 0; i < $preSubtitles.length; i++) {
            var $subtitle = $preSubtitles.eq(i);
            this.dfxpToMarkdown($subtitle.get(0));
        }

        // Store the original XML for comparison later.
        this.$originalXml = $preXml.clone();

        // Store the working XML for local edits.
        this.$xml = $preXml.clone();

        // Cache the first div.
        this.$firstDiv = $('div:first-child', this.$xml);

        // Convert both subtitle sets to milliseconds.
        this.convertTimes('milliseconds', $('p', this.$originalXml));
        this.convertTimes('milliseconds', $('p', this.$xml));

        return this;
    };

    this.utils = {
        leftPad: function(number, width, character) {
            /*
             * Left Pad a number to the given width, with zeros.
             * From: http://stackoverflow.com/a/1267338/22468
             *
             * Returns: string
             */

            character = character || '0';
            width -= number.toString().length;

            if (width > 0) {
                return new Array(width + (/\./.test(number) ? 2 : 1))
                                .join(character) + number;
            }
            return number.toString();
        },
        millisecondsToTimeExpression: function(milliseconds) {
            /*
             * Parses milliseconds into a time expression.
             */

            if (milliseconds === -1 || milliseconds === undefined || milliseconds === null) {
                throw Error("Invalid milliseconds to be converted" + milliseconds);
            }
            var time = Math.floor(milliseconds / 1000);
            var hours = ~~(time / 3600);
            var minutes = ~~((time % 3600) / 60);
            var fraction = milliseconds % 1000;
            var p = this.utils.leftPad;
            var seconds = time % 60;
            return p(hours, 2) + ':' +
                p(minutes, 2) + ':' +
                p(seconds, 2) +  ',' +
                p(fraction, 3);
        },
        rightPad: function(number, width, character) {
            /*
             * Right Pad a number to the given width, with zeros.
             * From: http://stackoverflow.com/a/1267338/22468
             *
             * Returns: string
             */

            character = character || '0';
            width -= number.toString().length;

            if (width > 0) {
                return number + new Array(width + (/\./.test(number) ? 2 : 1))
                    .join(character);
            }
            return number.toString();
        },
        timeExpressionToMilliseconds: function(timeExpression) {
            /*
             * Converts a time expression into milliseconds.
             * Since we trust the backend has generated this value,
             * we're not being to defensive about parsing, we
             * expect this to be in the HH:MM:SS.FFF form.
             * If number of digits on fraction is less than 3,
             * we right pad them.
             *
             * Returns: int
             */
            var components = timeExpression.match(/([\d]{2}):([\d]{2}):([\d]{2}).([\d]{1,3})/i);
            var millisecondsInHours    = components[1] * (3600 * 1000);
            var millisecondsInMinutes  = components[2] * (60 * 1000);
            var millisecondsInSeconds  = components[3] * (1000);
            var millisecondsInFraction = parseInt(this.utils.rightPad(components[4], 3), 10);

            return parseInt(millisecondsInHours +
                            millisecondsInMinutes +
                            millisecondsInSeconds +
                            millisecondsInFraction, 10);
        },
        xmlToString: function(xml) {
            /*
             * Convert an XML document to a string.
             *
             * Accepts: document object (XML tree)
             * Returns: string
             */

            var xmlString;

            if (window.XMLSerializer) {
                xmlString = (new XMLSerializer()).serializeToString(xml);
            } else {

                // For older versions of Internet Explorer.
                xmlString = xml.xml;

            }

            // Shield your eyes for the next 20 lines or so.
            //
            // A hacky way of removing the default namespaces that get thrown in
            // from creating elements with jQuery. We can get around this by
            // using document.createElementNS, but when we convert subtitles
            // from Markdown to HTML, we use jQuery to create multiple elements
            // on the fly from a string.
            //
            // TODO: Do something that makes more sense.
            xmlString = xmlString.replace(/span xmlns=\"http:\/\/www\.w3\.org\/1999\/xhtml\"/g, 'span');

            // Hey look, more hacks. For some reason, when the XML is spit to a
            // string, the attributes are all lower-cased. Fix them here.
            xmlString = xmlString.replace(/textdecoration/g, 'textDecoration');
            xmlString = xmlString.replace(/fontweight/g, 'fontWeight');
            xmlString = xmlString.replace(/fontstyle/g, 'fontStyle');

            return xmlString;
        }
    };

    this.addSubtitle = function(after, newAttrs, content) {
        /*
         * For adding a new subtitle to this set.
         *
         * If `after` is provided, we'll place the new subtitle directly
         * after that one. Otherwise, we'll place the new subtitle at the
         * beginning or end depending on subtitle count.
         *
         * `newAttrs` is an optional JSON object specifying the attributes to
         * be applied to the new element.
         *
         * `content` is an optional string to set the initial content.
         *
         * Returns: new subtitle element
         */

        if (typeof after !== 'number') {

            // If we have subtitles, default placement should be at the end.
            if (this.subtitlesCount()) {
                after = this.getLastSubtitle();

            // Otherwise, place the first subtitle at the beginning.
            } else {
                after = -1;
            }
        }

        // Firefox needs the namespace set explicitly
        var newSubtitle = document.createElementNS('http://www.w3.org/ns/ttml', 'p');

        // Init the default attrs and combine them with the defined newAttrs if
        // required.
        newAttrs = $.extend({
            'begin': '',
            'end': ''
        }, newAttrs);

        var $newSubtitle = $(newSubtitle).attr(newAttrs);

        // Finally, place the new subtitle.
        //
        // If after is -1, we need to place the subtitle at the beginning.
        if (after === -1) {

            // Prepend the new subtitle to the first div.
            this.$firstDiv.prepend($newSubtitle);

        // Otherwise, place it after the designated subtitle.
        } else {

            // First just make sure that the previous subtitle exists.
            var $previousSubtitle = this.getSubtitle(after);

            // Then place it.
            $previousSubtitle.after($newSubtitle);
        }

        if (typeof content !== 'undefined') {
            if (content === null) {
                this.content($newSubtitle, '');
            } else {
                this.content($newSubtitle, content);
            }
        }

        return $newSubtitle.get(0);
    };
    this.addSubtitleNode = function (newSubtitle, after){
        if (typeof after !== 'number') {

            // If we have subtitles, default placement should be at the end.
            if (this.subtitlesCount()) {
                after = this.getLastSubtitle();

                // Otherwise, place the first subtitle at the beginning.
            } else {
                after = -1;
            }
        }
        if (after === -1) {

            // Prepend the new subtitle to the first div.
            this.$firstDiv.prepend(newSubtitle);

            // Otherwise, place it after the designated subtitle.
        } else {

            // First just make sure that the previous subtitle exists.
            var $previousSubtitle = this.getSubtitle(after) || $(this.getLastSubtitle());

            // Then place it.
            $previousSubtitle.after(newSubtitle);
        }
    };
    this.changesMade = function() {
        /*
         * Check to see if any changes have been made to the working XML.
         *
         * Returns: true || false
         */

        var originalString = that.utils.xmlToString(that.$originalXml.get(0));
        var xmlString = that.utils.xmlToString(that.$xml.get(0));

        return originalString !== xmlString;
    };
    this.clearAllContent = function() {
        /*
         * Clear all of the content data for every subtitle.
         *
         * Returns: true
         */

        this.getSubtitles().text('');
    };
    this.clearAllTimes = function() {
        /*
         * Clear all of the timing data for every subtitle.
         *
         * Returns: true
         */

        this.getSubtitles().attr({
            'begin': '',
            'end': ''
        });

        return true;
    };
    this.clone = function(preserveText){
        var parser =  new this.constructor();
        parser.init(this.xmlToString(true));
        if (!preserveText){
            $('p', parser.$xml).text('');
        }
        return parser;
    };
    this.cloneSubtitle = function (indexOrElement, preserveText){
        var $subtitle = this.getSubtitle(indexOrElement).clone();
        if (!preserveText){
            $subtitle.text('');
        }
        return $subtitle;
    };
    this.content = function(indexOrElement, content) {
        /*
         * Either get or set the HTML content for the subtitle.
         *
         * Returns: current content (string)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (typeof content !== 'undefined') {
            $subtitle.text(content);
        }

        // OK. So, when parsing an XML node, you can't just get the HTML content.
        // We need to retrieve the total contents of the node by using "contents()",
        // but that returns an array of objects, like ['<b>', 'hi', '</b>', '<br />'],
        // etc. So we create a temporary div, and append the array to it, and retrieve
        // the rendered HTML that way. Then remove the temporary div.
        //
        // Reference: http://bit.ly/SwbPeR

        var subtitleContents = $subtitle.contents();

        for (var i = 0; i < subtitleContents.length; i++) {
            
            // Single newlines in subtitle text nodes will report as two newlines
            // when we use contents().
            //
            if (subtitleContents[i].data === '\n\n') {

                // Set them to single newlines.
                subtitleContents[i].data = '\n';
            }
        }

        return $('<div>').append(subtitleContents.clone()).remove().html();
    };
    this.contentRenderedFromNode = function(node) {
        /*
         * Pass the actual subtitle node, and get the raw nodeValue parsed
         * into Markdown-style HTML. Useful when you know you're getting
         * raw Markdown-style text and you don't want to do the
         * content -> HTML shakedown as we do in content();
         */

        var text = '';
        for (var i = 0; i < node.childNodes.length; i++) {
            text += node.childNodes[i].nodeValue;
        }

        return this.markdownToHTML(text);
    };
    this.contentRendered = function(indexOrElement) {
        /*
         * Return the content of the subtitle, rendered with Markdown styles.
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        return this.markdownToHTML(this.content(indexOrElement));
    };
    this.convertTimes = function(toFormat, $subtitles) {
        /*
         * Convert times to either milliseconds or time expressions
         * in the 'begin' and 'end' attributes, IN PLACE.
         */
        var convertFn = null;
        if (toFormat === 'milliseconds') {
            convertFn = that.utils.timeExpressionToMilliseconds;
        } else if (toFormat === 'timeExpression') {
            convertFn = that.utils.millisecondsToTimeExpression;
        } else {
            throw new Error("Unsupported time conversion " + toFormat);
        }
        for (var i = 0; i < $subtitles.length; i++) {
            var sub, currentStartTime, currentEndTime;
            sub = $subtitles.eq(i);
            currentStartTime = sub.attr('begin');
            currentEndTime = sub.attr('end');
            if (currentStartTime){
                sub.attr('begin', convertFn.call(this, currentStartTime));
            }
            if (currentEndTime){
                sub.attr('end', convertFn.call(this, currentEndTime));
            }
        }
    };
    this.dfxpToMarkdown = function(node) {
        /**
         * Coverts the DFXP spans to our markdowny syntax
         * in the node's children.
         * @param node
         * @return The node, modified in place
         */

        if (node === undefined){
            return node;
        }

        var marker, selector, targets;

        for (var i = 0; i < DFXP_REPLACE_SEQ.length; i++) {
            selector = DFXP_REPLACE_SEQ[i][0];
            marker = DFXP_REPLACE_SEQ[i][1];
            var $targets = $(selector, node);

            for (var t = 0; t < $targets.length; t++) {
                var $target = $targets.eq(t);
                $target.replaceWith(marker + $target.text() + marker);
            }
        }

        return node;
    };
    this.endTime = function(indexOrElement, endTime) {
        /*
         * Either get or set the end time for the subtitle.
         *
         * Returns: current end time (string)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (typeof endTime !== 'undefined') {
            if (parseFloat(endTime)) {
                $subtitle.attr('end', endTime);
            } else {
                $subtitle.attr('end', '');
            }
        }

        if (!$subtitle ) {
            return -1;
        }
        return parseFloat($subtitle.attr('end')) || -1;
    };
    this.getFirstSubtitle = function() {
        /*
         * Retrieve the first subtitle in this set.
         *
         * Returns: first subtitle element
         */

        return this.getSubtitle(0).get(0);
    };
    this.getLastSubtitle = function() {
        /*
         * Retrieve the last subtitle in this set.
         *
         * Returns: subtitle element or empty array
         */

        // Cache the selection.
        var $subtitles = this.getSubtitles();

        return this.getSubtitle($subtitles.length - 1).get(0);
    };
    this.getNextSubtitle = function(indexOrElement) {
        /*
         * Retrieve the subtitle that follows the given subtitle.
         *
         * Returns: subtitle element or null
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (!$subtitle) {
            return null;
        }

        return $subtitle.next().length > 0 ? $subtitle.next().eq(0).get(0) : null;
    };
    this.getNonBlankSubtitles = function() {
        /*
         * Retrieve all of the subtitles that have content.
         *
         * Returns: jQuery selection of elements
         */

        return this.getSubtitles().filter(function() {
            return $(this).text() !== '';
        });
    };
    this.getPreviousSubtitle = function(indexOrElement) {
        /*
         * Retrieve the subtitle that precedes the given subtitle.
         *
         * Returns: subtitle element
         */

        var el = this.getSubtitle(indexOrElement);

        if (!el) {
            return null;
        }
        return el.prev().length > 0 ? el.prev().eq(0).get(0) : null;
    };
    this.getSubtitleIndex = function(subtitle, subtitles) {
        /*
         * Retrieve the index of the given subtitle within the given subtitle set.
         *
         * Returns: integer
         */
        subtitles = subtitles || this.getSubtitles();
        return $(subtitles).index(subtitle);
    };
    this.getSubtitle = function(indexOrElement) {
        /*
         * Retrieve the subtitle based on the index given.
         *
         * If the given argument is an object, assume it's a DOM node
         * and check to make sure it exists in the subtitles tree.
         *
         * Returns: jQuery selection of element.
         *
         */

        // If an index or an object is not provided, throw an error.
        if (typeof indexOrElement !== 'number' && typeof indexOrElement !== 'object') {
            throw new Error('DFXP: You must supply either an index or an element.');
        }
        var subtitle;

        // If indexOrElement is a number, we'll need to query the DOM to
        // get the element.
        //
        // Note: you should only use this approach for checking one-off
        // subtitles. If you're checking more than one subtitle, it's much
        // faster to pass along pre-selected elements instead.
        //
        // Note also: if you're performing actions on a larger number of
        // subtitles, please consider using getSubtitles() and manually
        // iterating, to avoid performing DOM selection for lots of nodes.
        if (typeof indexOrElement === 'number') {
            subtitle = this.getSubtitles().get(indexOrElement);

        // Otherwise, it's an object.
        } else {

            // If this is already a jQuery selection, we need to extract the
            // node first.
            if (indexOrElement instanceof AmarajQuery) {
                indexOrElement = indexOrElement.get(0);
            }

            subtitle = indexOrElement;

        }

        if (!subtitle) {
            return null;
        }

        return $(subtitle);
    };
    this.getSubtitles = function() {
        /*
         * Retrieve the current set of subtitles.
         *
         * Returns: jQuery selection of nodes
         */

        return $('p', this.$xml);
    };
    this.isShownAt = function(indexOrElement, time) {
        /*
         * Determine whether the given subtitle should be displayed
         * at the given time.
         *
         * Returns: true || false
         */

        var subtitle = this.getSubtitle(indexOrElement).get(0);

        return (time >= this.startTime(subtitle) &&
                time <= this.endTime(subtitle));
    };
    this.markdownToDFXP = function(input) {
        /**
         * This is *not* a parser. Just a quick hack to convert
         * or markdowny syntax emphasys and strong syntax to
         * the correct dfxp span elements.
         *
         * Please note that when you use jQuery to create elements on the fly,
         * with attributes, jQuery flattens the casing of attributes so that all
         * attributes (such as fontWeight) get lower-cased (fontweight). This
         * sucks.
         */
        if (input === undefined){
            return input;
        }
        for (var i = 0; i < MARKUP_REPLACE_SEQ.length; i ++){
            input = input.replace(MARKUP_REPLACE_SEQ[i][0],
                MARKUP_REPLACE_SEQ[i][1]);
        }
        return input;
    };
    this.markdownToHTML = function(text) {
        /*
         * Convert text to Markdown-style rendered HTML with bold, italic,
         * underline, etc.
         */

        var replacements = [
            { match: /(\*\*)([^\*]+)(\*\*)/g, replaceWith: "<b>$2</b>" },
            { match: /(\*)([^\*]+)(\*{1})/g, replaceWith: "<i>$2</i>" },
            { match: /(_)([^_]+)(_{1})/g, replaceWith: "<u>$2</u>" },
            { match: /(\r\n|\n|\r)/gm, replaceWith: "<br />" },
            { match: / {2}/g, replaceWith: "&nbsp;&nbsp;" }
        ];

        for (var i = 0; i < replacements.length; i++) {
            var match = replacements[i].match;
            var replaceWith = replacements[i].replaceWith;

            text = text.replace(match, replaceWith);
        }

        return text;
    };
    this.needsAnySynced = function() {
        /*
         * Determine whether any of the subtitles in the set need
         * to be synced.
         *
         * Returns: true || false
         */

        var $subtitles = this.getSubtitles();

        for (var i = 0; i < $subtitles.length; i++) {
            var $subtitle = $subtitles.eq(i);

            var startTime = $subtitle.attr('begin');
            var endTime = $subtitle.attr('end');

            // If start time is empty, it always needs to be synced.
            if (startTime === '') {
                return true;
            }

            // If the end time is empty and this is not the last subtitle,
            // it needs to be synced.
            if (endTime === '' && ($subtitle.get(0) !== this.getLastSubtitle())) {
                return true;
            }

        }

        // Otherwise, we're good.
        return false;
    };
    this.needsAnyTranscribed = function($subtitles) {
        /*
         * Check all of the subtitles for empty content.
         *
         * Returns: true || false
         */

        if (!$subtitles) {
            $subtitles = this.getSubtitles();
        }

        for (var i = 0; i < $subtitles.length; i++) {

            var $subtitle = $subtitles.eq(i);

            if ($subtitle.text() === '') {
                return true;
            }
        }

        return false;
    };
    this.needsSyncing = function(indexOrElement) {
        /*
         * Given the zero-index or the element of the subtitle to be
         * checked, determine whether the subtitle needs to be synced.
         *
         * In most cases, if a subtitle has either no start time,
         * or no end time, it needs to be synced. However, if the
         * subtitle is the last in the list, the end time may be
         * omitted.
         *
         * Returns: true || false
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        var startTime = $subtitle.attr('begin');
        var endTime = $subtitle.attr('end');

        // If start time is empty, it always needs to be synced.
        if (startTime === '') {
            return true;
        }

        // If the end time is empty and this is not the last subtitle,
        // it needs to be synced.
        if (endTime === '' && ($subtitle.get(0) !== this.getLastSubtitle())) {
            return true;
        }

        // Otherwise, we're good.
        return false;
    };
    this.originalContent = function(indexOrElement, content) {
        /*
         * Either get or set the original HTML content for the subtitle.
         *
         * Returns: current original content (string)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (typeof content !== 'undefined') {
            $subtitle.attr('originalcontent', content);
        }

        return $subtitle.attr('originalcontent');
    };
    this.originalEndTime = function(indexOrElement, originalEndTime) {
        /*
         * Either get or set the original end time for the subtitle.
         *
         * Returns: current original end time (string)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (typeof originalEndTime !== 'undefined') {
            if (parseFloat(originalEndTime)) {
                $subtitle.attr('originalend', originalEndTime);
            } else {
                $subtitle.attr('originalend', '');
            }
        }

        return $subtitle.attr('originalend');
    };
    this.originalStartTime = function(indexOrElement, originalStartTime) {
        /*
         * Either get or set the original start time for the subtitle.
         *
         * Returns: current original start time (string)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (typeof originalStartTime !== 'undefined') {
            if (parseFloat(originalStartTime)) {
                $subtitle.attr('originalbegin', originalStartTime);
            } else {
                $subtitle.attr('originalbegin', '');
            }
        }

        return $subtitle.attr('originalbegin');
    };
    this.originalXmlToString = function() {
        return this.utils.xmlToString(this.$originalXml.get(0));
    };
    this.removeSubtitle = function(indexOrElement) {
        /*
         * Remove a subtitle.
         *
         * Returns: true
         */

        var $subtitle = this.getSubtitle(indexOrElement);
        var $subtitleParent = $subtitle.parent();

        // If the parent div has only one child, remove the parent div along with this
        // subtitle.
        if ($subtitleParent.children('p').length === 1) {

            // If the parent div is the first div, only remove the subtitle.
            if ($subtitleParent.get(0) === this.$firstDiv.get(0)) {
                $subtitle.remove();
            
            // Otherwise, remove the parent.
            } else {
                $subtitleParent.remove();
            }

        // Otherwise, there are other subtitles in this parent div. Only remove the subtitle.
        } else {
            $subtitle.remove();
        }

        return true;
    };
    this.removeSubtitles = function() {
        /*
         * Remove all subtitles from the working set.
         *
         * Returns: true
         */

        // Remove everything inside the body.
        $('body > *', this.$xml).remove();

        // Create a new original container for new subs.
        var newDiv = document.createElementNS('http://www.w3.org/ns/ttml', 'div');
        $('body', this.$xml).append(newDiv);

        this.$firstDiv = $(newDiv);


        return true;
    };
    this.resetSubtitles = function() {
        /*
         * For each subtitle, if the content is empty, delete the subtitle.
         * Otherwise, just reset the text and the start/end times.
         *
         * Returns: true
         */

        var $subtitles = this.getSubtitles();

        for (var i = 0; i < $subtitles.length; i++) {

            var $subtitle = $subtitles.eq(i);
            var content = $('<div>').append($subtitle.contents().clone()).remove().html();

            if (content === '') {
                $subtitle.remove();
            } else {
                $subtitle.text('').attr({
                    'begin': '',
                    'end': ''
                });
            }
        }
    };
    this.startOfParagraph = function(indexOrElement, startOfParagraph) {
        /*
         * Either get or set the startofparagraph for the subtitle.
         *
         * A <div> element marks the start of a new paragraph, 
         * therefore all first subtitles are start of paragraphs.
         * When we want to set it to true, we wrap that <p> inside
         * a <div> (checking that we're not already a first paragraph ).
         *
         * Returns: current state of startofparagraph (boolean)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        // If startOrParagraph was passed, we need to do something.
        //
        // Otherwise, we'll just return the current state.
        if (typeof startOfParagraph !== 'undefined') {

            if (startOfParagraph) {
                // This subtitle should now indicate that it is the start of a paragraph.

                // If the subtitle is not the first child, then we need to
                // close the previous div, and open a new div before this subtitle.
                if (!$subtitle.is(':first-child')) {

                    // Get the next siblings after this subtitle. We'll need to move them
                    // into our containing div later.
                    var $allNextSiblings = $subtitle.nextAll();

                    // Get the parent containing div of this subtitle. We'll need to move
                    // the new group of subtitles after the parent.
                    var $parentDiv = $subtitle.parent('div');

                    // Wrap the subtitle in a div.
                    $subtitle.wrap('<div>');

                    // Get the newly created div.
                    var $newDiv = $subtitle.parent('div');

                    // Append the siblings to the new div.
                    $newDiv.append($allNextSiblings);

                    // Move the new containing div after the original parent div.
                    $parentDiv.after($newDiv);
                }
            
            // startOfParagraph is false. Check to see if this is a valid subtitle to unmark
            // as a start of a paragraph. We can't unmark any non-first-children, or if the
            // subtitle is the first-child of the first div.
            } else if ($subtitle.is(':first-child') && $subtitle.parent().get(0) !== this.$firstDiv.get(0)) {
                // This subtitle should no longer indicate that it is the start of a paragraph.

                // Get the current div that we'll be removing.
                var $currentDiv = $subtitle.parent();

                // Get previous div.
                var $previousDiv = $currentDiv.prev();

                // Get all of the subtitles inside of this subtitle's containing div.
                var $subtitlesInDiv = $subtitle.parent().children('p');

                // Move the subtitles in the current div to the previous div.
                $previousDiv.append($subtitlesInDiv);

                // Remove the current div.
                $currentDiv.remove();
            }
        }

        return $subtitle.is(':first-child');
    };
    this.startTime = function(indexOrElement, startTime, inSeconds) {
        /*
         * Either get or set the start time for the subtitle.
         *
         * Returns: current start time (string)
         */

        var $subtitle = this.getSubtitle(indexOrElement);

        if (typeof startTime !== 'undefined') {
            if (parseFloat(startTime)) {
                $subtitle.attr('begin', startTime);
            } else {
                $subtitle.attr('begin', '');
            }
        }

        if (!$subtitle ) {
            return -1;
        }

        var val =  parseFloat($subtitle.attr('begin')) ;
        return isNaN(val) ? -1 : val;
    };
    this.startTimeFromNode = function(node) {
        /*
         * Retrieves the start time from the node, and converts it to seconds.
         * This is primarily for speed and display in a UI.
         */

        var startTime = node.getAttribute('begin');

        var val = parseFloat(startTime / 1000);
        return isNaN(val) ? -1 : val;

    };
    this.subtitlesCount = function() {
        /*
         * Retrieve the current number of subtitles.
         *
         * Returns: integer
         */

        return this.getSubtitles().length;
    };
    this.xmlToString = function(convertToTimeExpression, convertMarkdownToDFXP) {
        /*
         * Parse the working XML to a string.
         *
         * If `convertToTimeExpression` is specified, we convert current
         * `begin` and `end` attrubutes from the working format (milliseconds)
         * to time expressins, otherwise, output what we've got
         *
         * If `convertMarkdownToDFXP` is specified, we convert each subtitle
         * text from markdown-type strings to parsed DFXP.
         *
         * Returns: string
         */

        // Create a cloned set of XML, so we don't modify the original.
        var $cloned = this.$xml.clone();

        // If we need to convert Markdown to DFXP, do it here.
        if (convertMarkdownToDFXP) {
            var $subtitles = $('p', $cloned);

            for (var i = 0; i < $subtitles.length; i++) {
                var $subtitle = $subtitles.eq(i);
                var convertedText = this.markdownToDFXP($subtitle.text());

                // If the converted text is different from the subtitle text, it
                // means we were able to convert some Markdown to DFXP.
                if (convertedText !== $subtitle.text()) {

                    // First, empty out the subtitle's text.
                    $subtitle.text('');
                    
                    // Append the new node structure to the subtitle node.
                    $subtitle.append($(convertedText));
                }
            }
        }

        // Since our back-end is expecting time expressions, we may need to convert
        // the working XML's times to time expressions.
        if (convertToTimeExpression) {
            this.convertTimes('timeExpression', $('p', $cloned));
        }

        return this.utils.xmlToString($cloned.get(0));
    };

};