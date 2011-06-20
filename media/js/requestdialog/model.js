// Universal Subtitles, universalsubtitles.org
//
// Copyright (C) 2010 Participatory Culture Foundation
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

goog.provide('mirosubs.requestdialog.Model');

/**
 * @constructor
 * @param {Object} json from widget rpc
 * @param {string} videoID
 */
mirosubs.requestdialog.Model = function(json, videoId) {
    this.videoID_ = videoId;
    this.myLanguages_ = json['my_languages'];
    // A list of tuple of languages and their codes
    this.allLanguages_ = json['all_languages'];
    this.requestLanguages_ = [];
    this.track_ = true;
    this.description_ = null;

    goog.array.removeDuplicates(this.myLanguages_);
    this.myLanguages_ = goog.array.filter(
        this.myLanguages_, function(l) {
            return !!mirosubs.languageNameForCode(l);
        });
};

mirosubs.requestdialog.Model.prototype.addRequestLanguage = function(language){
    this.requestLanguages_.push(language);
};

mirosubs.requestdialog.Model.prototype.getMyLanguages = function(){
    return this.myLanguages_;
};

mirosubs.requestdialog.Model.prototype.getAllLanguages = function(){
    return this.allLanguages_;
};

mirosubs.requestdialog.Model.prototype.getRequestLanguages = function(){
    return this.requestLanguages_;
};

mirosubs.requestdialog.Model.prototype.setDescription = function(description){
    this.description_ = description;
};

mirosubs.requestdialog.Model.prototype.setTrackRequests = function(track){
    this.track_ = track;
};

/**
 * Post the request through rpc according to the current state of
 * "Request" object
 */
mirosubs.requestdialog.Model.prototype.submitRequest = function(callback){
    mirosubs.Rpc.call(
            'submit_subtitle_request',
            {
                'video_id':this.videoID_,
                'request_languages':this.requestLanguages_,
                'track_request':this.track_,
                'description':this.description_
            },
            goog.bind(callback, this));
};
