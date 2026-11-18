export function checkWhiteList(tenant, dispatcher): string | null {
    if (dispatcher.get(dispatcher, whiteList)) {
        return true 
    }
}