#!/usr/bin/env python3
"""Builds the "Note Lock-in" iPhone shortcut and signs it.

One tap (home screen, Action button or Back Tap): he speaks, the text lands in
notes/<id>.json of the private data repository, and Lock-in sorts it with
Claude at its next opening. Nothing personal is written here: the GitHub token
is asked when the shortcut is added.
"""
import os
import plistlib
import subprocess
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
NAME = "Note Lock-in"
REPO = "gbuquen44-dot/fonte-data"


def uid():
    return str(uuid.uuid4()).upper()


def text(parts):
    """A token string from literal strings and (uuid, name) outputs."""
    string = ""
    ranges = {}
    for part in parts:
        if isinstance(part, str):
            string += part
        else:
            ranges["{%d, 1}" % len(string)] = {"OutputUUID": part[0], "Type": "ActionOutput", "OutputName": part[1]}
            string += "￼"
    value = {"string": string}
    if ranges:
        value["attachmentsByRange"] = ranges
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def output(uuid_str, name):
    return {"Value": {"OutputUUID": uuid_str, "Type": "ActionOutput", "OutputName": name},
            "WFSerializationType": "WFTextTokenAttachment"}


def field(items):
    return {
        "Value": {"WFDictionaryFieldValueItems": [
            {"WFItemType": 0, "WFKey": text([k]), "WFValue": text(v if isinstance(v, list) else [v])}
            for k, v in items
        ]},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def action(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def puid(act):
    return act["WFWorkflowActionParameters"]["UUID"]


def format_date(source, name, pattern):
    return action("is.workflow.actions.format.date", {
        "UUID": uid(), "WFDate": text([(source, name)]), "WFDateFormatStyle": "Custom",
        "WFDateFormat": pattern, "WFTimeFormatStyle": "Short",
    })


def build():
    token = action("is.workflow.actions.gettext", {"UUID": uid(), "WFTextActionText": "COLLE-TON-JETON-ICI"})
    dictate = action("is.workflow.actions.dictatetext", {
        "UUID": uid(), "WFSpeechLanguage": "fr-FR", "WFDictateTextStopListening": "On Tap",
    })
    now = action("is.workflow.actions.date", {"UUID": uid(), "WFDateActionMode": "Current Date"})
    day = format_date(puid(now), "Date", "yyyy-MM-dd")
    stamp = format_date(puid(now), "Date", "yyyy-MM-dd'T'HH:mm:ssZZZZZ")
    ident = format_date(puid(now), "Date", "yyyy-MM-dd-'r'HHmmss")
    note = action("is.workflow.actions.dictionary", {
        "UUID": uid(),
        "WFItems": field([
            ("id", [(puid(ident), "Formatted Date")]),
            ("text", [(puid(dictate), "Dictated Text")]),
            ("date", [(puid(day), "Formatted Date")]),
            ("iso", [(puid(stamp), "Formatted Date")]),
            ("source", "raccourci"),
            ("status", "pending"),
        ]),
    })
    encoded = action("is.workflow.actions.base64encode", {
        "UUID": uid(), "WFInput": output(puid(note), "Dictionary"), "WFBase64LineBreakMode": "None", "WFEncodeMode": "Encode",
    })
    send = action("is.workflow.actions.downloadurl", {
        "UUID": uid(),
        "ShowHeaders": True,
        "WFURL": text(["https://api.github.com/repos/%s/contents/notes/" % REPO, (puid(ident), "Formatted Date"), ".json"]),
        "WFHTTPMethod": "PUT",
        "WFHTTPBodyType": "JSON",
        "WFHTTPHeaders": field([
            ("Authorization", ["Bearer ", (puid(token), "Text")]),
            ("Accept", "application/vnd.github+json"),
            ("X-GitHub-Api-Version", "2022-11-28"),
        ]),
        "WFJSONValues": field([("message", "Note"), ("content", [(puid(encoded), "Base64 Encoded")])]),
    })
    done = action("is.workflow.actions.notification", {
        "UUID": uid(), "WFNotificationActionTitle": "Lock-in", "WFNotificationActionBody": "Noté. Je range ça à ta prochaine ouverture.",
        "WFNotificationActionSound": False,
    })
    return {
        "WFWorkflowActions": [token, dictate, now, day, stamp, ident, note, encoded, send, done],
        "WFWorkflowClientVersion": "3100.0.4.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59511},
        "WFWorkflowImportQuestions": [{
            "ActionIndex": 0,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": "Colle ton jeton GitHub (le même que dans Lock-in, Réglages, Sauvegarde)",
        }],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowNoInputBehavior": {"Name": "WFWorkflowNoInputBehaviorShowError", "Parameters": {}},
    }


def main():
    work = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
    unsigned = os.path.join(work, NAME + ".unsigned.shortcut")
    signed = os.path.join(OUT, NAME + ".shortcut")
    with open(unsigned, "wb") as f:
        plistlib.dump(build(), f, fmt=plistlib.FMT_BINARY)
    print("%d actions" % len(build()["WFWorkflowActions"]))
    proc = subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", unsigned, "--output", signed],
                          capture_output=True, text=True)
    print((proc.stdout + proc.stderr).strip()[:600] or "signed")
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
