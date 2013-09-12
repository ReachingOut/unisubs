# -*- coding: utf-8 -*-
# Amara, universalsubtitles.org
#
# Copyright (C) 2013 Participatory Culture Foundation
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see
# http://www.gnu.org/licenses/agpl-3.0.html.

from django.core.urlresolvers import reverse
import simplejson as json

from utils import test_factories

class TestEditor(object):
    """Simulates the editor widget for unit tests"""
    def __init__(self, client, video, original_language_code=None,
                 base_language_code=None, mode=None):
        """Construct a TestEditor

        :param client: django TestClient object for HTTP requests
        :param video: Video object to edit
        :param original_language_code: language code for the video audio.
        Should be set if and only if the primary_audio_language_code hasn't
        been set for the video.
        :param base_language_code: base language code for to use for
        translation tasks.
        :param mode: one of ("review", "approve" or None)
        """
        self.client = client
        self.video = video
        self.base_language_code = base_language_code
        if original_language_code is None:
            self.original_language_code = video.primary_audio_language_code
        else:
            if video.primary_audio_language_code is not None:
                raise AssertionError(
                    "primary_audio_language_code is set (%r)" %
                    video.primary_audio_language_code)
            self.original_language_code = original_language_code
        self.mode = mode
        self.task_approved = None
        self.task_id = None
        self.task_notes = None
        self.task_type = None

    def set_task_data(self, task, approved, notes):
        """Set data for the task that this edit is for.

        :param task: Task object
        :param approved: did the user approve the task.  Should be one of the
        values of Task.APPROVED_IDS.
        :param notes: String to set for notes
        """
        type_map = {
            10: 'subtitle',
            20: 'translate',
            30: 'review',
            40: 'approve',
        }
        self.task_id = task.id
        self.task_type = type_map[task.type]
        self.task_notes = notes
        self.task_approved = approved

    def _submit_widget_rpc(self, method, **data):
        """POST data to the widget:rpc view."""

        url = reverse('widget:rpc', args=(method,))
        post_data = dict((k, json.dumps(v)) for k, v in data.items())
        response = self.client.post(url, post_data)
        response_data = json.loads(response.content)
        if 'error' in response_data:
            raise AssertionError("Error calling widget rpc method %s:\n%s" %
                                 (method, response_data['error']))
        return response_data

    def run(self, language_code, completed=True, save_for_later=False):
        """Make the HTTP requests to simulate the editor

        We will use test_factories.dxfp_sample() for the subtitle data.

        :param language_code: code for the language of these subtitles
        :param completed: simulate the completed checkbox being set
        :param save_for_later: simulate the save for later button
        """

        self._submit_widget_rpc('fetch_start_dialog_contents',
                video_id=self.video.video_id)
        existing_language = self.video.subtitle_language(language_code)
        if existing_language is not None:
            subtitle_language_pk = existing_language.pk
        else:
            subtitle_language_pk = None

        response_data = self._submit_widget_rpc(
            'start_editing',
            video_id=self.video.video_id,
            language_code=language_code,
            original_language_code=self.original_language_code,
            base_language_code=self.base_language_code,
            mode=self.mode,
            subtitle_language_pk=subtitle_language_pk)
        session_pk = response_data['session_pk']

        self._submit_widget_rpc('finished_subtitles',
                                completed=completed,
                                save_for_later=save_for_later,
                                session_pk=session_pk,
                                subtitles=test_factories.dxfp_sample('en'),
                                task_approved=self.task_approved,
                                task_id=self.task_id,
                                task_notes=self.task_notes,
                                task_type=self.task_type)