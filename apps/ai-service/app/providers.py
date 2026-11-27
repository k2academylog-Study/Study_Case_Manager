import base64
import re
from html import escape

import httpx
from fastapi import HTTPException

from .config import config


class DeliveryError(Exception):
    def __init__(self, message, *, uncertain=False):
        super().__init__(message)
        self.uncertain=uncertain


def graph_api():
    version=config().whatsapp_graph_api_version
    if not re.fullmatch(r"v[0-9]+\.[0-9]+",version):
        raise HTTPException(503,"Configure a supported WhatsApp Graph API version.")
    return "https://graph.facebook.com/"+version


def approved_template(name: str, language: str) -> str:
    settings=config()
    if not settings.channel_ready("whatsapp"):
        raise HTTPException(503,"WhatsApp Business delivery is awaiting configuration.")
    if not settings.whatsapp_business_account_id.isdigit():
        raise HTTPException(503,"The WhatsApp Business account ID is invalid.")
    try:
        response=httpx.get(f"{graph_api()}/{settings.whatsapp_business_account_id}/message_templates",
                           headers={"Authorization":"Bearer "+settings.whatsapp_access_token},
                           params={"name":name,"fields":"name,language,status,components,parameter_format","limit":100},timeout=10)
        response.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(502,"Meta could not verify the approved WhatsApp template.")
    for row in response.json().get("data",[]):
        if row["name"]==name and row["language"]==language and row["status"]=="APPROVED" and row.get("parameter_format","POSITIONAL")=="POSITIONAL":
            components=row["components"]
            body=next((part["text"] for part in components if part["type"]=="BODY"),None)
            if body and all(part["type"]=="BODY" for part in components):
                return body
    raise HTTPException(422,"Select an approved Meta template with a positional message body.")


def _attachment(path: str) -> dict:
    settings=config()
    try:
        response=httpx.get(f"{settings.next_public_supabase_url.rstrip('/')}/storage/v1/object/authenticated/academic-reports/{path}",
                          headers={"Authorization":"Bearer "+settings.supabase_service_role_key,"apikey":settings.supabase_service_role_key},
                          timeout=15)
        response.raise_for_status()
    except httpx.HTTPError:
        raise DeliveryError("The authorized report attachment is unavailable.")
    if len(response.content)>15_728_640 or not response.content.startswith(b"%PDF"):
        raise DeliveryError("The report attachment is invalid.")
    return {"filename":"academic-report.pdf","content":base64.b64encode(response.content).decode("ascii")}


def deliver(row: dict) -> str:
    settings=config()
    channel=row["channel"]
    if not settings.channel_ready(channel):
        raise DeliveryError("The communication provider is awaiting configuration.")
    headers={}
    if channel=="email":
        url="https://api.resend.com/emails"
        headers={"Authorization":"Bearer "+settings.resend_api_key,"Idempotency-Key":"scm-"+str(row["id"])}
        payload={"from":settings.email_from,"to":[row["destination"]],"subject":row["subject"],"text":row["body"]}
        payload["html"]="".join("<p>"+escape(part).replace("\n","<br>")+"</p>" for part in row["body"].split("\n\n"))
        if row.get("storage_path"):
            payload["attachments"]=[_attachment(row["storage_path"])]
    else:
        if not settings.whatsapp_phone_number_id.isdigit():
            raise DeliveryError("The WhatsApp phone number ID is invalid.")
        url=f"{graph_api()}/{settings.whatsapp_phone_number_id}/messages"
        headers={"Authorization":"Bearer "+settings.whatsapp_access_token}
        try:
            body=approved_template(row["template_name"],row["template_language"])
            variables=row["template_variables"] or []
            rendered=re.sub(r"\{\{(\d+)\}\}",lambda token:variables[int(token[1])-1],body)
            if rendered!=row["body"]:
                raise DeliveryError("The approved Meta template changed before delivery.")
        except (HTTPException,IndexError):
            raise DeliveryError("The approved Meta template could not be verified.")
        template={"name":row["template_name"],"language":{"code":row["template_language"]}}
        if row["template_variables"]:
            template["components"]=[{"type":"body","parameters":[{"type":"text","text":value} for value in row["template_variables"]]}]
        payload={"messaging_product":"whatsapp","to":row["destination"].removeprefix("+"),"type":"template","template":template,
                 "biz_opaque_callback_data":str(row["id"])}
    try:
        response=httpx.post(url,json=payload,headers=headers,timeout=18)
    except httpx.HTTPError:
        raise DeliveryError("Provider response was interrupted.",uncertain=channel=="whatsapp")
    if response.status_code>=500 or response.status_code in (408,409):
        raise DeliveryError(f"Provider response {response.status_code} requires reconciliation.",uncertain=channel=="whatsapp")
    if not response.is_success:
        raise DeliveryError(f"Provider rejected the delivery (HTTP {response.status_code}).")
    try:
        data=response.json()
        return str(data["id"] if channel=="email" else data["messages"][0]["id"])
    except (ValueError, KeyError, IndexError, TypeError):
        raise DeliveryError("Provider accepted the request without a usable message ID.",uncertain=True)

